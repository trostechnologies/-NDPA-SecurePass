import { requestContext } from './request-context.mjs';
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { digest, equal, newFactor, verifyFactor } from './crypto.mjs';
const derive = promisify(scrypt);
export const normalize = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');
export const text = (value, max, required = false) =>
  typeof value === 'string' && value.length <= max && (!required || !!value.trim());
export const emailOK = (value) =>
  text(value, 180, true) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
export const hashPassword = async (value) => {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${(await derive(value, salt, 64)).toString('hex')}`;
};
export const verifyPassword = async (value, stored) => {
  try {
    const [s, h] = stored.split(':');
    return timingSafeEqual(await derive(value, Buffer.from(s, 'hex'), 64), Buffer.from(h, 'hex'));
  } catch {
    return false;
  }
};
export const safeUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.display_name ?? u.name,
  role: u.role,
  department: u.display_department ?? u.department,
  title: u.display_title ?? u.title,
  status: u.membership_status ?? u.status,
  createdAt: u.created_at,
});
export const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
export async function registerAuth(app, config, store, rate) {
  const { db, keys, scoped, tx, audit, member, metric, grant } = store;
  const cookie = (value, age) =>
    `sp_session=${value}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${age}; ${config.secure ? 'Secure;' : ''}`;
  const required = (u) =>
    config.mfaRequired === 'all' || (config.mfaRequired === 'admin' && u.role === 'admin');
  const factorFor = async (id) => await db.prepare('SELECT * FROM factors WHERE user_id=?').get(id);
  const freshMember = async (scope, id) => {
    const u = await member(scope, id);
    return u && u.status === 'active' && u.membership_status === 'active' ? u : null;
  };
  const auth = async (req, res, next) => {
    const token = (req.headers.cookie || '')
      .split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith('sp_session='))
      ?.slice(11);
    const session =
      token &&
      (await db
        .prepare(
          'SELECT * FROM sessions WHERE token_hash=? AND tenant_id=? AND site_id=? AND expires_at>?',
        )
        .get(digest(token), ...scoped(req.scope), Date.now()));
    const u = session && (await freshMember(req.scope, session.user_id));
    if (!u || (required(u) && (!session.mfa_verified_at || !(await factorFor(u.id)))))
      return res.status(401).json({ error: 'Not authenticated or session expired' });
    req.user = u;
    req.session = session;
    req.token = token;
    requestContext.run(
      { scope: req.scope, userId: u.id, role: u.role, tokenHash: digest(token) },
      next,
    );
  };
  const admin = (req, res, next) =>
    req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Forbidden' });
  const recent = (req, res, next) =>
    Date.now() - req.session.created_at <= 10 * 60000
      ? next()
      : res.status(403).json({ error: 'Sign in again before this sensitive operation' });
  async function issue(scope, user, res, mfa = false) {
    const token = randomBytes(32).toString('base64url');
    await db
      .prepare(
        'INSERT INTO sessions(token_hash,user_id,expires_at,tenant_id,site_id,created_at,mfa_verified_at) VALUES (?,?,?,?,?,?,?)',
      )
      .run(
        digest(token),
        user.id,
        Date.now() + config.sessionMs,
        ...scoped(scope),
        Date.now(),
        mfa ? Date.now() : 0,
      );
    res.setHeader('Set-Cookie', cookie(token, Math.floor(config.sessionMs / 1000)));
  }
  async function challenge(scope, u, kind) {
    const token = randomBytes(32).toString('base64url'),
      h = digest(token),
      factor = kind === 'verify' ? null : newFactor(u.email);
    await db
      .prepare('DELETE FROM auth_challenges WHERE user_id=? AND tenant_id=? AND site_id=?')
      .run(u.id, ...scoped(scope));
    await db
      .prepare('INSERT INTO auth_challenges VALUES (?,?,?,?,?,?,?,0)')
      .run(
        h,
        u.id,
        ...scoped(scope),
        kind,
        factor ? keys.seal(factor.secret, `challenge:${h}`) : null,
        Date.now() + 5 * 60000,
      );
    return {
      challengeToken: token,
      mfaRequired: true,
      enrollment: !!factor,
      ...(factor ? { secret: factor.secret, uri: factor.uri } : {}),
    };
  }
  async function consumeFactor(user, code) {
    const factor = await factorFor(user.id);
    if (!factor) return false;
    const secret = keys.open(factor.secret_cipher, `mfa:${user.id}`),
      counter = verifyFactor(secret, code, factor.last_counter);
    if (counter !== null) {
      await db.prepare('UPDATE factors SET last_counter=? WHERE user_id=?').run(counter, user.id);
      return true;
    }
    if (typeof code !== 'string' || !/^[a-f0-9]{32}$/i.test(code)) return false;
    const hashes = keys.open(factor.recovery_cipher, `recovery:${user.id}`),
      match = hashes.findIndex((h) => equal(h, digest(`${user.id}:${code.toLowerCase()}`)));
    if (match < 0) return false;
    hashes.splice(match, 1);
    await db
      .prepare('UPDATE factors SET recovery_cipher=? WHERE user_id=?')
      .run(keys.seal(hashes, `recovery:${user.id}`), user.id);
    await audit(user.scope || config.sites[0], user.id, 'MFA_RECOVERY_USED', user.id);
    return true;
  }
  const count = (await db.prepare('SELECT COUNT(*) AS n FROM users').get()).n;
  if (!count) {
    const email = normalize(config.env.SECUREPASS_ADMIN_EMAIL),
      password = config.env.SECUREPASS_ADMIN_PASSWORD;
    if (
      !emailOK(email) ||
      !text(password, 1024, true) ||
      password.length < 16 ||
      password.startsWith('REPLACE') ||
      (config.production && password.length < 24)
    )
      throw Error(
        'Initial administrator requires a unique password of 16–1024 characters (24 minimum in production); placeholders are refused',
      );
    const u = {
      id: randomUUID(),
      email,
      name: 'Initial Administrator',
      role: 'admin',
      department: 'Operations',
      title: 'Administrator',
    };
    const passwordHash = await hashPassword(password);
    await tx(async () => {
      await db
        .prepare(
          'INSERT INTO users(id,email,name,role,department,title,status,password_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        )
        .run(
          u.id,
          email,
          u.name,
          u.role,
          u.department,
          u.title,
          'active',
          passwordHash,
          new Date().toISOString(),
        );
      for (const scope of config.sites) {
        await grant(scope, u);
        await audit(
          scope,
          'system',
          'BOOTSTRAP',
          u.id,
          'Initial operator explicitly provisioned for configured sites',
        );
      }
    });
  }
  const dummy = await hashPassword(randomBytes(32).toString('hex'));
  app.post(
    '/api/login',
    rate('login-source', 30, 900000),
    rate('login-global', 150, 900000, () => 'installation'),
    rate('login-account', 10, 900000, (req) => normalize(req.body?.email)),
    asyncRoute(async (req, res) => {
      const { email, password } = req.body || {};
      if (!emailOK(email) || !text(password, 1024, true)) {
        await metric(req.scope, 'login_failed');
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const u = await db.prepare('SELECT * FROM users WHERE email=?').get(normalize(email));
      const valid = await verifyPassword(password, u?.password_hash || dummy);
      const current = u && (await freshMember(req.scope, u.id));
      if (
        !valid ||
        !current ||
        current.password_hash !== u.password_hash ||
        (await db
          .prepare('SELECT 1 FROM reset_tokens WHERE user_id=? AND expires>?')
          .get(u.id, Date.now()))
      ) {
        await metric(req.scope, 'login_failed');
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      if ((await factorFor(current.id)) || required(current))
        return res.json(
          await challenge(req.scope, current, (await factorFor(current.id)) ? 'verify' : 'enroll'),
        );
      await tx(async () => {
        await issue(req.scope, current, res);
        await audit(req.scope, current.id, 'LOGIN', current.id);
      });
      res.json({ user: safeUser(current) });
    }),
  );
  app.post('/api/mfa/complete', rate('mfa-source', 20, 900000), async (req, res) => {
    const { challengeToken, code } = req.body || {};
    const h = typeof challengeToken === 'string' ? digest(challengeToken) : '';
    const c = await db
      .prepare(
        'SELECT * FROM auth_challenges WHERE token_hash=? AND tenant_id=? AND site_id=? AND expires>? AND attempts<5',
      )
      .get(h, ...scoped(req.scope), Date.now());
    const u = c && (await freshMember(req.scope, c.user_id));
    if (!u) return res.status(401).json({ error: 'MFA challenge expired or invalid' });
    let recoveryCodes;
    const ok = await tx(async () => {
      const claimed = await db
        .prepare(
          'UPDATE auth_challenges SET attempts=attempts+1 WHERE token_hash=? AND tenant_id=? AND site_id=? AND expires>? AND attempts<5 RETURNING *',
        )
        .get(h, ...scoped(req.scope), Date.now());
      const current = claimed && (await freshMember(req.scope, c.user_id));
      if (!current || current.password_hash !== u.password_hash || current.role !== u.role)
        return false;
      if (c.kind === 'verify') {
        if (!(await consumeFactor({ ...u, scope: req.scope }, code))) return false;
      } else {
        if (c.kind === 'enroll' && (await factorFor(u.id))) return false;
        const secret = keys.open(c.secret_cipher, `challenge:${h}`),
          counter = verifyFactor(secret, code);
        if (counter === null) return false;
        recoveryCodes = Array.from({ length: 10 }, () => randomBytes(16).toString('hex'));
        await db.prepare('INSERT OR REPLACE INTO factors VALUES (?,?,?,?)').run(
          u.id,
          keys.seal(secret, `mfa:${u.id}`),
          counter,
          keys.seal(
            recoveryCodes.map((x) => digest(`${u.id}:${x}`)),
            `recovery:${u.id}`,
          ),
        );
        await db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
        await audit(req.scope, u.id, 'MFA_ENROLLED', u.id);
      }
      await db.prepare('DELETE FROM auth_challenges WHERE token_hash=?').run(h);
      await issue(req.scope, u, res, true);
      await audit(req.scope, u.id, 'LOGIN', u.id, 'MFA verified');
      return true;
    });
    if (!ok) {
      await metric(req.scope, 'mfa_failed');
      return res.status(401).json({ error: 'Invalid or already-used authenticator/recovery code' });
    }
    res.json({ user: safeUser(u), ...(recoveryCodes ? { recoveryCodes } : {}) });
  });
  app.get('/api/session', auth, (req, res) =>
    res.json({
      user: safeUser(req.user),
      scope: { tenantId: req.scope.tenantId, siteId: req.scope.siteId, key: req.scope.key },
      mfaVerified: !!req.session.mfa_verified_at,
    }),
  );
  app.post('/api/logout', auth, async (req, res) => {
    await tx(async () => {
      await db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(req.token));
      await audit(req.scope, req.user.id, 'LOGOUT', req.user.id);
    });
    res.setHeader('Set-Cookie', cookie('', 0));
    res.json({ ok: true });
  });
  app.get('/api/account/security', auth, async (req, res) => {
    const factor = await factorFor(req.user.id);
    res.json({
      mfaEnabled: !!factor,
      recoveryCodesRemaining: factor
        ? keys.open(factor.recovery_cipher, `recovery:${req.user.id}`).length
        : 0,
    });
  });
  app.post(
    '/api/account/mfa/start',
    auth,
    recent,
    rate('factor-rotation', 5, 3600000, (req) => req.user.id),
    asyncRoute(async (req, res) => {
      if (
        !text(req.body?.password, 1024, true) ||
        !(await verifyPassword(req.body.password, req.user.password_hash))
      )
        return res.status(401).json({ error: 'Invalid credentials' });
      if (
        (await factorFor(req.user.id)) &&
        !(await tx(
          async () => await consumeFactor({ ...req.user, scope: req.scope }, req.body.code),
        ))
      )
        return res
          .status(401)
          .json({ error: 'A fresh authenticator or recovery code is required' });
      res.json(
        await challenge(req.scope, req.user, (await factorFor(req.user.id)) ? 'rotate' : 'enroll'),
      );
    }),
  );
  app.post(
    '/api/account/password',
    auth,
    recent,
    rate('password-change', 5, 3600000, (req) => req.user.id),
    asyncRoute(async (req, res) => {
      const x = req.body || {};
      if (
        !text(x.newPassword, 1024, true) ||
        x.newPassword.length < 16 ||
        !text(x.password, 1024, true) ||
        !(await verifyPassword(x.password, req.user.password_hash))
      )
        return res.status(400).json({
          error: 'Valid current password and a new password of 16–1024 characters are required',
        });
      const passwordHash = await hashPassword(x.newPassword);
      const ok = await tx(async () => {
        const current = await freshMember(req.scope, req.user.id);
        if (!current || current.password_hash !== req.user.password_hash) return false;
        if (
          (await factorFor(current.id)) &&
          !(await consumeFactor({ ...current, scope: req.scope }, x.code))
        )
          return false;
        await db
          .prepare('UPDATE users SET password_hash=? WHERE id=?')
          .run(passwordHash, current.id);
        await db.prepare('DELETE FROM sessions WHERE user_id=?').run(current.id);
        await db.prepare('DELETE FROM reset_tokens WHERE user_id=?').run(current.id);
        await audit(req.scope, current.id, 'PASSWORD_CHANGED', current.id);
        return true;
      });
      if (!ok) return res.status(401).json({ error: 'Fresh authentication required' });
      res.setHeader('Set-Cookie', cookie('', 0));
      res.json({ ok: true, reauthenticate: true });
    }),
  );
  app.post('/api/users/:id/password-reset', auth, admin, recent, async (req, res) => {
    const user = await member(req.scope, req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    if (
      (await db.prepare('SELECT COUNT(*) AS n FROM memberships WHERE user_id=?').get(user.id)).n !==
      1
    )
      return res.status(409).json({
        error:
          'Multi-site identities require account-owner recovery or the operator recovery process',
      });
    if (
      !text(req.body?.verificationReference, 80, true) ||
      !/^\w[\w./-]{2,79}$/.test(req.body.verificationReference)
    )
      return res
        .status(400)
        .json({ error: 'Non-sensitive identity-verification case reference required' });
    const token = randomBytes(32).toString('base64url');
    await tx(async () => {
      await db.prepare('DELETE FROM reset_tokens WHERE user_id=?').run(user.id);
      await db
        .prepare('INSERT INTO reset_tokens VALUES (?,?,?)')
        .run(digest(token), user.id, Date.now() + 15 * 60000);
      await db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
      await db.prepare('DELETE FROM auth_challenges WHERE user_id=?').run(user.id);
      await audit(
        req.scope,
        req.user.id,
        'RESET_TOKEN_ISSUED',
        user.id,
        `Case reference hash ${keys.blind(req.scope.scopeId, req.body.verificationReference)}`,
      );
    });
    res.json({
      token,
      expiresInSeconds: 900,
      delivery: 'Deliver to the verified account owner through an approved secure channel',
    });
  });
  app.post(
    '/api/password-reset',
    rate('password-reset', 10, 900000),
    asyncRoute(async (req, res) => {
      const x = req.body || {},
        r =
          text(x.token, 100, true) &&
          (await db
            .prepare('SELECT * FROM reset_tokens WHERE token_hash=? AND expires>?')
            .get(digest(x.token), Date.now()));
      if (!r || !text(x.newPassword, 1024, true) || x.newPassword.length < 16)
        return res.status(400).json({ error: 'Invalid or expired reset request' });
      const passwordHash = await hashPassword(x.newPassword);
      const ok = await tx(async () => {
        const current = await db
          .prepare('SELECT * FROM reset_tokens WHERE token_hash=? AND expires>?')
          .get(digest(x.token), Date.now());
        const user = current && (await freshMember(req.scope, current.user_id));
        if (
          !user ||
          ((await factorFor(user.id)) &&
            !(await consumeFactor({ ...user, scope: req.scope }, x.code)))
        )
          return false;
        await db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash, user.id);
        await db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
        await db.prepare('DELETE FROM auth_challenges WHERE user_id=?').run(user.id);
        await db.prepare('DELETE FROM reset_tokens WHERE user_id=?').run(user.id);
        await audit(req.scope, user.id, 'PASSWORD_RESET', user.id);
        return true;
      });
      if (!ok) return res.status(401).json({ error: 'Reset could not be verified' });
      res.json({ ok: true });
    }),
  );
  return { auth, admin, recent, issue, required, consumeFactor };
}

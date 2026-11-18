import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';
import { newInviteCode, normalizeInviteCode, formatInviteCode } from '../server/invite-codes.mjs';

test('invite codes: 10-character Crockford format, forgiving lookup, legacy codes accepted', () => {
  for (let i = 0; i < 200; i++) assert.match(newInviteCode(), /^[0-9A-HJKMNP-TV-Z]{10}$/);
  assert.equal(normalizeInviteCode('abcde-fghjk'), 'ABCDEFGHJK');
  assert.equal(normalizeInviteCode(' ab cde-FGH jk '), 'ABCDEFGHJK');
  assert.equal(normalizeInviteCode('OOOOO-IIIII'), '0000011111');
  assert.equal(normalizeInviteCode('LLLLL-00000'), '1111100000');
  assert.equal(normalizeInviteCode('A'.repeat(32).toLowerCase()), 'A'.repeat(32));
  assert.equal(normalizeInviteCode('ABCDEFGHJ'), null);
  assert.equal(normalizeInviteCode('ABCDEFGHJKU'), null);
  assert.equal(normalizeInviteCode('ABCDE-FGHJU'), null);
  assert.equal(normalizeInviteCode(42), null);
  assert.equal(formatInviteCode('ABCDEFGHJK'), 'ABCDE-FGHJK');
});

test('reception role: desk routes allowed, administration denied, invite auto-fill and single use', async () => {
  const f = await fixture();
  try {
    const admin = await f.login();
    assert.equal(admin.status, 200);
    const make = async (email, role) => {
      const r = await f.request('POST', '/api/users', {
        cookie: admin.cookie,
        body: { email, name: role, role, password: `unique-${role}-test-password-12345` },
      });
      assert.equal(r.status, 201);
      return r.body;
    };
    await make('desk@example.test', 'reception');
    const host = await make('host@example.test', 'staff');
    const desk = await f.login('desk@example.test', 'unique-reception-test-password-12345');
    const staff = await f.login('host@example.test', 'unique-staff-test-password-12345');
    assert.equal(desk.status, 200);
    assert.equal(desk.body.user.role, 'reception');

    // Denied: user management, privacy approval/holds, audit, metrics, purge, host settings.
    for (const [method, route] of [
      ['GET', '/api/users'],
      ['POST', '/api/users'],
      ['GET', '/api/privacy'],
      ['POST', '/api/privacy/requests'],
      ['POST', '/api/privacy/requests/x/verify'],
      ['POST', '/api/privacy/requests/x/fulfill'],
      ['GET', '/api/privacy/requests/x/export'],
      ['POST', '/api/privacy/holds'],
      ['GET', '/api/audit/verify'],
      ['GET', '/api/security/metrics'],
      ['POST', '/api/purge'],
      ['PATCH', '/api/hosts/reception'],
    ])
      assert.equal(
        (
          await f.request(method, route, {
            cookie: desk.cookie,
            ...(method === 'GET' ? {} : { body: {} }),
          })
        ).status,
        403,
        `${method} ${route}`,
      );
    // Staff remain denied on desk routes.
    for (const route of ['/api/reception/lookup', '/api/reception/checkin'])
      assert.equal(
        (await f.request('POST', route, { cookie: staff.cookie, body: {} })).status,
        403,
        route,
      );
    assert.equal(
      (await f.request('POST', '/api/reception/lookup', { body: { inviteCode: 'x' } })).status,
      401,
    );

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Lagos',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const invite = await f.request('POST', '/api/invitations', {
      cookie: staff.cookie,
      body: {
        guestName: 'Invited Guest',
        guestEmail: 'invited@example.test',
        guestPhone: '+2348000000001',
        guestOrganization: 'Guest organisation',
        hostEmployeeId: host.id,
        expectedDate: today,
        expectedTime: '12:00',
        purpose: 'Meeting',
      },
    });
    assert.equal(invite.status, 201);
    assert.match(invite.body.inviteCode, /^[0-9A-HJKMNP-TV-Z]{10}$/);
    const typed =
      `${invite.body.inviteCode.slice(0, 5)}-${invite.body.inviteCode.slice(5)}`.toLowerCase();

    // Public lookup still reveals no invitee details, even with the formatted code.
    const pub = await f.request('POST', '/api/invitations/lookup', {
      body: { inviteCode: typed },
    });
    assert.equal(pub.status, 200);
    assert.equal(pub.body.guestEmail, undefined);
    assert.equal(pub.body.guestName, undefined);

    // Reception lookup auto-fills from the invitation record.
    const looked = await f.request('POST', '/api/reception/lookup', {
      cookie: desk.cookie,
      body: { inviteCode: typed },
    });
    assert.equal(looked.status, 200);
    assert.equal(looked.body.invitation.guestName, 'Invited Guest');
    assert.equal(looked.body.invitation.guestEmail, 'invited@example.test');
    assert.equal(looked.body.invitation.hostEmployeeId, host.id);

    const base = {
      fullName: 'Invited Guest',
      email: 'invited@example.test',
      phone: '+2348000000001',
      hostEmployeeId: host.id,
      generalConsentGranted: true,
      noticeVersion: 'test-1',
    };
    assert.equal(
      (
        await f.request('POST', '/api/reception/checkin', {
          cookie: desk.cookie,
          body: { ...base, email: 'other@example.test', inviteCode: typed },
        })
      ).status,
      409,
    );
    const checked = await f.request('POST', '/api/reception/checkin', {
      cookie: desk.cookie,
      body: { ...base, inviteCode: typed },
    });
    assert.equal(checked.status, 201);
    assert.equal(checked.body.visitType, 'pre_registered');
    // Single use: neither reception nor the public kiosk can redeem it again.
    assert.equal(
      (
        await f.request('POST', '/api/reception/lookup', {
          cookie: desk.cookie,
          body: { inviteCode: typed },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await f.request('POST', '/api/reception/checkin', {
          cookie: desk.cookie,
          body: { ...base, email: 'invited@example.test', inviteCode: typed },
        })
      ).status,
      409,
    );

    // Walk-in registration.
    const walkin = await f.request('POST', '/api/reception/checkin', {
      cookie: desk.cookie,
      body: { ...base, email: 'walkin@example.test', fullName: 'Walk In' },
    });
    assert.equal(walkin.status, 201);
    assert.equal(walkin.body.visitType, 'walk_in');

    // On-site list: only checked-in visitors; no invitations, users or audit log.
    const data = await f.request('GET', '/api/data', { cookie: desk.cookie });
    assert.equal(data.status, 200);
    assert.deepEqual(
      data.body.visitors.map((v) => v.status),
      data.body.visitors.map(() => 'checked_in'),
    );
    assert.equal(data.body.visitors.length, 2);
    assert.equal(data.body.invitations.length, 0);
    assert.equal(data.body.users.length, 0);
    assert.equal(data.body.auditLogs.length, 0);

    // Check-out allowed for reception, denied for staff.
    assert.equal(
      (
        await f.request('PATCH', `/api/visitors/${walkin.body.id}/checkout`, {
          cookie: staff.cookie,
          body: {},
        })
      ).status,
      403,
    );
    const out = await f.request('PATCH', `/api/visitors/${walkin.body.id}/checkout`, {
      cookie: desk.cookie,
      body: {},
    });
    assert.equal(out.status, 200);
    assert.equal(out.body.status, 'checked_out');
    assert.equal(
      (await f.request('GET', '/api/data', { cookie: desk.cookie })).body.visitors.length,
      1,
    );
  } finally {
    await f.close();
  }
});

import { test, expect } from '@playwright/test';
import * as OTPAuth from 'otpauth';

test('initial page, MFA login, user creation, staff routing, reload, suspension, logout and session expiry', async ({
  page,
  browser,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install();
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Visitor Access Registration Kiosk' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'User Management', exact: true })).toHaveCount(0);
  expect((await page.request.get('/api/users')).status()).toBe(401);
  expect(
    (
      await page.request.post('/api/checkin', {
        headers: { Origin: baseURL!, 'Content-Type': 'application/json' },
        data: '{',
      })
    ).status(),
  ).toBe(400);
  await page.getByRole('button', { name: 'Staff Login', exact: true }).click();
  await page.getByLabel('Work email').fill('browser-admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid credentials');
  await page.getByLabel('Password', { exact: true }).fill('browser-admin-password-12345');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Set up your authenticator' })).toBeVisible();
  expect((await page.request.get('/api/users')).status()).toBe(401);
  const secret = await page.locator('code').first().innerText();
  await page
    .getByLabel('Authenticator or recovery code', { exact: true })
    .fill(new OTPAuth.TOTP({ secret }).generate());
  await page.getByRole('button', { name: 'Verify authenticator', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Save your recovery codes' })).toBeVisible();
  const codes = await page.locator('code').allTextContents();
  expect(codes).toHaveLength(10);
  await page.getByRole('button', { name: 'I saved my recovery codes' }).click();
  await page.getByRole('button', { name: 'User Management', exact: true }).click();
  await page.getByRole('button', { name: 'Add New User Profile' }).click();
  const form = page.locator('form');
  await form.getByPlaceholder('e.g. Babatunde Sanusi').fill('Browser Staff');
  await form.locator('input[type=email]').fill('browser-staff@example.test');
  await form.locator('input[type=password]').fill('browser-staff-password-12345');
  await form.getByRole('button', { name: 'Create User Profile', exact: true }).click();
  await expect(page.locator('tr').filter({ hasText: 'browser-staff@example.test' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'User Management', exact: true })).toBeVisible();
  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  await staff.goto(baseURL!);
  await staff.getByRole('button', { name: 'Staff Login', exact: true }).click();
  await staff.getByLabel('Work email').fill('browser-staff@example.test');
  await staff.getByLabel('Password', { exact: true }).fill('browser-staff-password-12345');
  await staff.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(staff.getByRole('button', { name: 'Guest Invitations', exact: true })).toBeVisible();
  await expect(staff.getByRole('button', { name: 'User Management', exact: true })).toHaveCount(0);
  expect((await staff.request.get('/api/users')).status()).toBe(403);
  await staff.reload();
  await expect(staff.getByRole('button', { name: 'Guest Invitations', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'User Management', exact: true }).click();
  await page
    .locator('tr')
    .filter({ hasText: 'browser-staff@example.test' })
    .getByTitle('Edit User Profile')
    .click();
  await page.locator('form select').selectOption('suspended');
  await page.getByRole('button', { name: 'Save Profile Changes' }).click();
  await expect(page.locator('tr').filter({ hasText: 'browser-staff@example.test' })).toContainText(
    'Suspended',
  );
  await staff.reload();
  await expect(staff.getByRole('button', { name: 'Staff Login', exact: true })).toBeVisible();
  expect((await staff.request.get('/api/session')).status()).toBe(401);
  await staffContext.close();
  await page.getByTitle('Sign Out', { exact: true }).click();
  expect((await page.request.get('/api/users')).status()).toBe(401);
  await page.getByRole('button', { name: 'Staff Login', exact: true }).click();
  await page.getByLabel('Work email').fill('browser-admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('browser-admin-password-12345');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Authenticator or recovery code', { exact: true }).fill(codes[0]);
  await page.getByRole('button', { name: 'Verify authenticator', exact: true }).click();
  await expect(page.getByRole('button', { name: 'User Management', exact: true })).toBeVisible();
  await page.request.post('/__test/expire');
  await page.clock.fastForward(61000);
  await expect(page.getByRole('heading', { name: 'SecurePass staff sign-in' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'User Management', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

import { expect, Page, test } from '@playwright/test';
import { BrimsRole, credentialsFor } from '../support/roles';

export class BrimsAgent {
  constructor(
    readonly page: Page,
    readonly role: BrimsRole
  ) {}

  async login(): Promise<void> {
    const credentials = credentialsFor(this.role);

    await test.step(`${this.role}: sign in with Employee ID`, async () => {
      await this.page.goto('/login');
      await expect(this.page.getByRole('heading', { name: 'BRIMS Portal' })).toBeVisible();

      await this.page.locator('#employeeId').fill(credentials.employeeId);
      await this.page.locator('#password').fill(credentials.password);

      await Promise.all([
        this.page.waitForURL(url => !url.pathname.endsWith('/login'), { timeout: 30_000 }),
        this.page.getByRole('button', { name: /log in|sign in/i }).click()
      ]);

      await expect(this.page).not.toHaveURL(/\/login(?:\?|$)/);
      await expect(this.page.locator('body')).not.toContainText('Employee ID not found');
      await expect(this.page.locator('body')).not.toContainText('Invalid password');
    });
  }

  async logout(): Promise<void> {
    await test.step(`${this.role}: sign out`, async () => {
      const profileOrUserMenu = this.page.getByRole('button', { name: /profile|account|user menu/i }).first();
      if (await profileOrUserMenu.isVisible().catch(() => false)) {
        await profileOrUserMenu.click();
      }

      const logout = this.page.getByRole('button', { name: /log ?out|sign ?out/i }).or(
        this.page.getByRole('link', { name: /log ?out|sign ?out/i })
      ).first();

      if (await logout.isVisible().catch(() => false)) {
        await logout.click();
        await expect(this.page).toHaveURL(/\/login/);
      } else {
        // A fresh browser context is the isolation boundary when the current UI has no accessible logout control.
        await this.page.context().clearCookies();
      }
    });
  }

  async verifyRoute(path: string, expectedText: RegExp): Promise<void> {
    await test.step(`${this.role}: verify ${path}`, async () => {
      await this.page.goto(path);
      await expect(this.page).not.toHaveURL(/\/login/);
      await expect(this.page.locator('body')).toContainText(expectedText);
    });
  }

  async verifyForbiddenRoute(path: string): Promise<void> {
    await test.step(`${this.role}: cannot use ${path}`, async () => {
      await this.page.goto(path);
      const body = this.page.locator('body');
      const forbiddenMessage = body.getByText(/unauthorized|forbidden|access denied|permission/i).first();
      const redirectedHome = this.page.url().replace(/\/$/, '') === new URL('/', this.page.url()).toString().replace(/\/$/, '');
      const redirectedLogin = /\/login(?:\?|$)/.test(this.page.url());

      expect(
        redirectedHome || redirectedLogin || await forbiddenMessage.isVisible().catch(() => false),
        `Expected ${path} to be denied or redirected for ${this.role}`
      ).toBeTruthy();
    });
  }

  async signElectronicRecord(reason: string): Promise<void> {
    const { password } = credentialsFor(this.role);

    await test.step(`${this.role}: apply electronic signature`, async () => {
      const reasonInput = this.page.getByLabel(/reason|justification|comments/i).first();
      if (await reasonInput.isVisible().catch(() => false)) {
        await reasonInput.fill(reason);
      }

      await this.page.locator('#signature-password').fill(password);
      await this.page.getByRole('button', { name: /sign.*confirm|authenticate.*sign/i }).click();
    });
  }
}

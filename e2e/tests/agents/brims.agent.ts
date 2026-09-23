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

  async navigateInApp(path: string): Promise<void> {
    await this.page.evaluate((targetPath) => {
      const navigate = (window as typeof window & { __appNavigate?: (value: string) => void }).__appNavigate;
      if (!navigate) throw new Error('BRIMS in-app navigator is unavailable');
      navigate(targetPath);
    }, path);
    await expect.poll(() => new URL(this.page.url()).pathname).toBe(path);
  }

  async verifyRoute(path: string, expectedText: RegExp): Promise<void> {
    await test.step(`${this.role}: verify ${path}`, async () => {
      await this.navigateInApp(path);
      await expect(this.page.locator('body')).toContainText(expectedText);
    });
  }

  async verifyForbiddenRoute(path: string): Promise<void> {
    await test.step(`${this.role}: cannot use ${path}`, async () => {
      await this.navigateInApp(path);
      const forbiddenMessage = this.page.getByText(/unauthorized|forbidden|access denied|permission/i).first();
      const redirectedHome = new URL(this.page.url()).pathname === '/';

      expect(
        redirectedHome || await forbiddenMessage.isVisible().catch(() => false),
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

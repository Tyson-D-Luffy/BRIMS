import { test, expect } from '@playwright/test';
import { BrimsAgent } from '../agents/brims.agent';
import { BrimsRole, hasCredentials } from '../support/roles';

const roleChecks: Array<{ role: BrimsRole; route: string; text: RegExp }> = [
  { role: 'admin', route: '/admin', text: /admin|user management|permission/i },
  { role: 'creator', route: '/product-masters', text: /product master/i },
  { role: 'reviewer', route: '/batch-sheet-masters/approvals', text: /approval|batch sheet/i },
  { role: 'approver', route: '/batch-sheet-masters/approvals', text: /approval|batch sheet/i },
  { role: 'qaIssuance', route: '/batches', text: /batch sheet|request/i },
  { role: 'production', route: '/batches', text: /batch sheet|request/i },
  { role: 'audit', route: '/audit/system', text: /audit/i }
];

for (const check of roleChecks) {
  test(`@smoke ${check.role} can login and reach its workspace`, async ({ browser }) => {
    test.skip(!hasCredentials(check.role), `Credentials for ${check.role} are not configured`);

    const context = await browser.newContext();
    const page = await context.newPage();
    const agent = new BrimsAgent(page, check.role);

    await agent.login();
    await agent.verifyRoute(check.route, check.text);
    await expect(page.locator('body')).not.toContainText(/uncaught|application error/i);

    await context.close();
  });
}

test('@smoke unauthorized user cannot open administration', async ({ browser }) => {
  test.skip(!hasCredentials('unauthorized'), 'Unauthorized-role credentials are not configured');

  const context = await browser.newContext();
  const agent = new BrimsAgent(await context.newPage(), 'unauthorized');

  await agent.login();
  await agent.verifyForbiddenRoute('/admin');

  await context.close();
});

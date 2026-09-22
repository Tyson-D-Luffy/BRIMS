import { test, expect, Browser, BrowserContext } from '@playwright/test';
import { BrimsAgent } from '../agents/brims.agent';
import { BrimsRole, hasCredentials } from '../support/roles';

async function createAgent(browser: Browser, role: BrimsRole): Promise<{ context: BrowserContext; agent: BrimsAgent }> {
  const context = await browser.newContext();
  const agent = new BrimsAgent(await context.newPage(), role);
  await agent.login();
  return { context, agent };
}

test.describe('@workflow BRIMS controlled golden workflow', () => {
  test.skip(
    process.env.RUN_BRIMS_MUTATING_E2E !== 'true',
    'Set RUN_BRIMS_MUTATING_E2E=true only for an approved, isolated development test dataset.'
  );

  test('role agents can establish isolated authenticated sessions', async ({ browser }) => {
    const requiredRoles: BrimsRole[] = ['creator', 'reviewer', 'approver', 'qaIssuance', 'production', 'audit'];
    const missing = requiredRoles.filter(role => !hasCredentials(role));
    test.skip(missing.length > 0, `Missing credentials: ${missing.join(', ')}`);

    const sessions: Array<{ context: BrowserContext; agent: BrimsAgent }> = [];
    try {
      for (const role of requiredRoles) {
        sessions.push(await createAgent(browser, role));
      }

      await sessions[0].agent.verifyRoute('/product-masters', /product master/i);
      await sessions[1].agent.verifyRoute('/batch-sheet-masters/approvals', /approval|batch sheet/i);
      await sessions[2].agent.verifyRoute('/batch-sheet-masters/approvals', /approval|batch sheet/i);
      await sessions[3].agent.verifyRoute('/batches', /batch sheet|request/i);
      await sessions[4].agent.verifyRoute('/batches', /batch sheet|request/i);
      await sessions[5].agent.verifyRoute('/audit/system', /audit/i);

      await expect(sessions[0].agent.page).not.toHaveURL(/\/login/);
    } finally {
      await Promise.all(sessions.map(session => session.context.close()));
    }
  });

  test.fixme(
    true,
    'Next increment: map stable data-testid hooks for create → review → approve → issue → print → handover → production receipt → QA completion.'
  );
});

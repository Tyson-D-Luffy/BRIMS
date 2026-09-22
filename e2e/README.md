# BRIMS workflow test agents

This package runs role-based Playwright agents against the Google AI Studio development deployment. It does not require a locally running BRIMS server.

## Safety model

- Smoke tests are read-only: login, route access and authorization checks.
- Mutating workflow tests require `RUN_BRIMS_MUTATING_E2E=true`.
- Use only dedicated test identities and an isolated development dataset.
- Never commit the populated `.env` file or test passwords.
- Failed runs retain trace, screenshot and video evidence in `test-results/`.

## Setup

1. Copy `.env.example` to `.env` and populate the AI Studio link and dedicated test credentials.
2. Export those values in the shell or CI secret store. Playwright intentionally does not load secrets from source files.
3. Install and run:

   ```bash
   cd e2e
   npm install
   npx playwright install chromium
   npm run test:smoke
   ```

To run the controlled mutating suite:

```bash
RUN_BRIMS_MUTATING_E2E=true npm run test:workflow
```

## Agent roles

- Admin: administration and RBAC checks
- Creator: Product Master and Batch Sheet Master creation
- Reviewer: workflow review and return
- Approver: approval and activation
- QA Issuance: issuance, printing and handover
- Production: custody receipt and submission to QA
- Audit: final audit-trail verification
- Unauthorized: negative-access testing

The first increment provides secure sessions and read-only smoke coverage. The complete mutating workflow will be enabled after stable `data-testid` hooks are added to the BRIMS UI and the live development test identities are supplied.

# Public student mode

Updated 15 November 2026. VidyaPath is a public study app; static chapters, papers and formulas require no student login or database. Progress, bookmarks and private notes remain on the student's device.

Retrieval uses the bundled, hash-pinned corpus and BM25, with an optional private E5 index service. Production AI uses Upstash for shared limits and budgets, plus configured answer-provider keys. Operator diagnostics use a separate developer session.

The retired school/LMS portals, database authentication and experimental database vector backend are not part of the app. Database migrations, ingestion/upload scripts, credentials and preview checks are unnecessary. The operator confirmed uninstalling the Supabase GitHub app.

Normal CI runs quality checks, dependency audit and a production build once. Docker validation is manual for operators using containers. Deployment size, corpus integrity and privacy gates remain enforced; Next's standalone global error handler does not require academic data.

See [deployment](./DEPLOYMENT_RUNBOOK.md), [AI data and security](./AI_SECURITY_AND_RETRIEVAL.md), and [chapter coverage](./INDEXING_PLAN.md) for current procedures and limitations. Historical readiness/cutover guides for the retired LMS have been removed.

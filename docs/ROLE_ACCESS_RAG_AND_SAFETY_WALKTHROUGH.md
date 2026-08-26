# VidyaPath role access, RAG, and safety walkthrough

This guide is the operator hand-off for the Class 10 and Class 12 LMS. It deliberately contains no reusable passwords. Schools provision accounts; users should never guess a demo password from an email address or roll number.

## Role access

| Role | Sign-in URL | Identifier | Who provisions it | First destination |
| --- | --- | --- | --- | --- |
| Student | `/student/login` | Parent phone (primary), Student ID, or roll code; school/class details resolve shared-family phones | Class teacher or school admin, individually or CSV/Excel import | `/dashboard`, or `/student/first-login` when a password change is required |
| Teacher | `/teacher/login` | Phone (primary), Teacher ID, or email | Principal/admin, individually or CSV/Excel import | `/teacher`, or `/teacher/first-login` when a password change is required |
| Admin (principal) | `/admin/login` | Phone (primary), Principal ID, or email | Developer after approving the school request | `/admin`, or `/admin/first-login` when a password change is required |
| Developer | `/developer/login` | Restricted developer username/email | Platform owner through deployment secrets | `/developer` |

Selecting a role on any sign-in screen changes the browser path to the corresponding role URL. A protected role page redirects an unauthenticated visitor back to that same role's login URL and keeps only a safe internal `next` path.

### Account lifecycle

1. A school submits an affiliate/access request with the principal's contact details.
2. The developer reviews the request, activates the school, and issues the principal a random one-time password. The principal's phone number is the easy login ID.
3. The principal chooses a private password, then creates/imports teachers and assigns subjects, classes, sections, and class-teacher responsibility.
4. Every teacher receives a random one-time password and signs in primarily with their phone number. The principal can reset a teacher account.
5. A class teacher adds students one at a time or imports CSV, TSV, or Excel. Required identity fields are name, class roll number, and parent phone; individualized subjects can be included.
6. A student signs in primarily with the linked parent phone and their own random one-time password. School/class/section fields disambiguate shared or repeated phone numbers. A class teacher can reset a student account.
7. Principal, teacher, and student accounts marked `must_change_password` are held at their first-login screen until the one-time password is replaced.
8. Role cookies are school-scoped and cannot open another role's APIs. Disabled profiles or inactive grants are denied even if the underlying auth user still exists.

Phone numbers are identifiers, never passwords. Predictable phone-as-password or roll-number-as-password schemes expose every school account to trivial guessing and are intentionally rejected.

### Roster templates

- Teacher import: `name, phone, email, employeeCode, subjects, classTeacherClass, classTeacherSection`.
- Student import: `name, rollNumber, parentPhone, parentName, subjects`.
- `subjects` accepts a comma/semicolon-separated list and is stored per student.
- Imported credentials are returned only in the one-time result view; operators should transmit them through an approved private channel and avoid screenshots or shared spreadsheets.

For a local demo, set optional `SEED_*` values in `.env.local` and run `npm run seed:auth-users`. When password values are omitted, the script generates strong one-time passwords and prints them once. Do not run the demo seed against a production project and do not copy credentials into source control or screenshots.

### Lockouts and recovery

Repeated failures are limited by IP and identity. A `429` response includes `Retry-After`; the UI disables the button and shows a countdown rather than encouraging repeated attempts. Students contact their class teacher, teachers contact their principal, and principals contact the platform developer. Environment-only developer accounts are recovered by the platform owner, not through the public reset screen.

For a local single-process demo, `RATE_LIMIT_USE_LOCAL_MEMORY=1` removes remote rate-limit latency. Multi-instance deployments must leave it off and configure Upstash Redis or the shared Supabase limiter.

## Curriculum boundary

The advertised student catalogue contains 115 Class 10 and Class 12 chapters. Class 11 bridge material remains internal for career/transition tools but is not listed, searchable, statically generated, or linked from the public chapter library.

## RAG ingestion and chunking

### Board papers

- Source: the configured CBSE paper dataset downloaded from Hugging Face.
- Structure: section headers, then numbered question blocks, then sentence boundaries for oversized questions.
- Target: 260 words; overlap: 48 words; minimum: 80 words.
- Filters: unsupported subjects, instruction boilerplate, corrupted/private-use glyphs, low-signal text, and duplicates.
- Metadata: stable ID, source type, class, subject, chapter mapping when confident, year, paper type, source path, chunk index, total chunks, and word count after sanitation.

### NCERT textbooks

- Source: the configured NCERT textbook dataset downloaded from Hugging Face.
- Structure: headings, paragraphs, and question/answer groups.
- Target: 240 words; maximum: 360 words; minimum: 70 words.
- Metadata: stable ID, source type, chapter ID/title/number, class, subject, language/medium when available, source path, chunk index, word count, optional page, image presence, and visual tags.

### Current verified artifact

- 25,628 unique supported chunks.
- 21,325 paper chunks and 4,303 textbook chunks.
- Zero duplicate chunk IDs across files.
- All 25,628 chunks have a persisted vector.
- 14,706 chunks are chapter-mapped; 10,922 paper chunks remain intentionally subject-scoped for broad retrieval.
- 8,759 textbook visual assets are available. Paper-page image extraction is marked unavailable when PyMuPDF is not installed instead of falsely reporting an enabled empty pipeline.

Retrieval combines lexical ranking, persisted vectors, chapter/topic hints, source diversity, and visual quotas. Chapter-scoped retrieval prefers exact chapter matches; unmapped paper text is only broad subject evidence. Answers must expose source labels and lower confidence when grounding is weak.

## Student AI safety

The tutor applies deterministic checks before retrieval or provider calls:

- Crisis or self-harm language receives an immediate supportive response and routes to local emergency help.
- Requests to share personal data are stopped with age-appropriate privacy guidance.
- Dangerous procedural requests receive a safe alternative.
- Prompt-injection attempts cannot override the student policy or reveal hidden prompts.
- The model is instructed to stay within supported Class 10/12 subjects, avoid fabricated citations, distinguish facts from uncertainty, and encourage learning instead of completing assessed work dishonestly.

The guardrails are server-side; hiding a client control is never treated as a safety boundary.

## Release verification

Before a hackathon or production release:

1. Run `npm ci` from a clean checkout.
2. Run `npm run check:ci`, `npm run test:security-guards`, `npm run check:route-links`, `npm run verify:context`, `npm run check:data-quality`, and `npm run eval:rag`.
3. Run `npm run build` with deployment-equivalent environment variables.
4. Apply and lint all Supabase migrations in a disposable local database.
5. Provision one account per role in the intended Supabase project, then verify login, first-login, logout, recovery, deactivation, and cross-role denial.
6. Verify phone layouts at 390px in both themes for login, chapters, chapter detail, formulas, and each protected dashboard.
7. Configure Upstash and observability for a multi-instance deployment.

Local checks do not prove that a remote Supabase project has the right accounts or migrations. Treat credentialed deployment verification as a separate release gate.

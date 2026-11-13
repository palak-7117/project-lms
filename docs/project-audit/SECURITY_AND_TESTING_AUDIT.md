# Security and testing audit

## Test evidence (executed 2026-11-13)

Command from backend: npm test. Result: 11 tests, 11 pass, 0 fail, approx 8 seconds. Files: tests/auth-admin.test.js and tests/academic-workflows.test.js. Coverage includes health/login, credential errors, role denial, Student/Teacher creation, admission/authorization, curriculum mappings, concurrent/pending enrollment, allocation/history rollback, session expiry/logout/last active Admin, offerings/eligibility, file upload/download/shared refs, assignment drafts/submissions/grading, Google Forms link validation, attendance correction and scoped deletion/cleanup failure.

Command: npm run test:browser. Result: Playwright workflow passed using installed Chrome 157.0.8103.39 after bundled Chromium process launch was refused. Browser diagnostics: two expected Admin API 403 responses for Student/Teacher, zero unexpected console errors, zero unexpected failed requests, five navigation-cancelled requests, no in-flight post-logout 401 in this run. Browser exercised Admin setup/enrollment, Teacher offering/material/assignment/quiz/attendance, Student download/submission/grade/feedback/Google Form link opening through a controlled test route/attendance, and unauthorized Admin page/API access.

Tests/harness.js checks source DB_NAME is learnspace_db and 19 tables, creates a generated learnspace_test_b04_* database by SHOW CREATE TABLE, directs backend writes to that database and temp file dir, then drops that matching generated schema. The live database was only queried for metadata by this audit; tests may read its DDL but their writes target the isolated schema. Final post-run table count remained 19 in learnspace_db; no matching test schema remained.

These results are historical evidence and were not rerun during the documentation review. No coverage instrumentation or exhaustive branch-coverage report is configured. Passing tests do not prove production readiness or cover browser compatibility beyond the tested environment.

## Findings by severity

### High
- No versioned SQL DDL/migration file exists in the repository. A new deployment/recovery currently depends on the pre-existing DB or the test-only live-schema clone process. Check-in a reviewed, versioned schema/migration strategy before another environment or deployment.
- Destructive Student/Teacher deletion is permanent and there is no audit-event table. This follows the requested deletion policy, but it means investigation/recovery evidence is intentionally erased. Resolve retention/legal requirements before production. Do not put deleted personal data into logs as a workaround.
- Cloud storage, backup/restore procedure and recovery drills are not present. Local private storage is process-hosted and must be backed up consistently with DB metadata; production durability is not established.

### Medium
- Assignment grade <= maximum is enforced in the service transaction, not by SQL CHECK; direct SQL writers could bypass it. Keep writes behind service or add a DB-safe design if other writers are introduced.
- file-cleanup failure occurs after DB deletion commits. The endpoint returns 503 and worker retries; client retry may hit not-found even though cleanup is pending. UI/operations should explain this as “database deletion completed; file cleanup pending,” with an idempotent status/monitoring endpoint considered.
- Multer buffers files in memory (five files up to 10 MB each), allowing a substantial per-request memory footprint under concurrency. Consider streaming/quota/rate controls for production.
- File type validation checks extension plus basic magic signatures. Office formats are ZIP/OLE containers, not malware-scanned or deeply parsed. Add malware scanning and request/user quotas before accepting untrusted production uploads.
- Enrollment duplicate-pending prevention is transactional service logic plus Student row locking; no unique partial index enforces it independently. Direct DB writers could create multiple pending requests.
- No automated test for every endpoint or concurrency race is evident. Add targeted tests for row-lock/file-cleanup races, role-IDOR matrix and production cookie/CORS deployment configuration.
- The repo Git status command is broken in this environment (“this operation must be run in a work tree”), despite rev-parse, log and branches working. Dirty/clean state and diffs could not be established; resolve before branch handoff.
- Test harness requires privileges to create/drop databases and has a cleanup routine. Run only with a dedicated development MySQL user; inspect generated names and confirm cleanup after test failure.

### Low
- Frontend keeps legacy localStorage modules. Current HTML wires backend modules, but stale modules are a regression hazard and old local data remains in browsers. Keep page script references explicit and plan a user-approved migration/cleanup.
- auth.config exports idleSessionMinutes=30 while requireAuth currently embeds the 30-minute interval in SQL. A future setting change could drift.
- Deletion paths and status changes are destructive and lack a UI confirmation flow in the route layer. Confirm policy and provide explicit frontend confirmation before exposing destructive controls broadly.
- Live DB schema does not itself require reviewer_id when an approved/rejected request has reviewed_at. Current service supplies reviewer; direct SQL could violate the stronger product rule.

## Security controls verified in source

- Argon2id password hashing; public auth response excludes hash.
- Random opaque session token, only SHA-256 hash stored in user_sessions.
- HttpOnly session cookie, production Secure and __Host- prefix, SameSite=Lax, absolute 8-hour expiry; 30-minute idle invalidation; logout/account disable revocation.
- Server-enforced route authentication/roles and per-resource ownership/Student eligibility.
- CSRF cookie/header plus exact Origin allowlist on unsafe routes; wildcard credentialed CORS rejected.
- Helmet, x-powered-by disabled, safe central error responses; no SQL stack/query/password values sent to clients.
- Parameterized queries and transaction helpers.
- Private file storage, UUID keys, content signature check, access-controlled download and cleanup queue.

## Must-review deployment concerns

Check TLS termination and Express trust proxy policy before relying on Secure cookies behind a proxy. Confirm FRONTEND_ORIGIN uses the actual HTTPS origin. Protect .env and database account; grant least privilege while accounting for isolated test schema creation. Restrict DB network access. Define backups for both database and files, log redaction, rate limits/login throttling, operational monitoring, retention, recovery and incident response. Existing source does not establish all of these controls.
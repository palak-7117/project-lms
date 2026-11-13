# Batch 4 future checklist

**Status:** Batch 4 / Phase 4 was not undertaken. This is a proposed future checklist, not an approved requirement list. The project owner must define and approve scope before a receiving developer treats an item as required.

Use this checklist after the project owner confirms Batch 4 scope. Do not treat optional recommendations as approved features.

## Scope and baseline

- [ ] Confirm Batch 4 deliverables, acceptance criteria, deadline and reviewer.
- [ ] Confirm the working branch and base branch with the team.
- [ ] Resolve the current Git status failure before editing; status currently says “this operation must be run in a work tree.”
- [ ] Read README.md, API_REFERENCE.md, DATABASE_AUDIT.md and SECURITY_AND_TESTING_AUDIT.md.
- [ ] Confirm no schema change is needed. Any required schema change needs separate approval and a reviewed migration.
- [ ] Keep credentials, personal data and session tokens out of docs, logs and commits.

## Admin browser workflow

- [ ] Admin can sign in and reload /auth/me without losing session.
- [ ] Admin dashboard loads directory and academic data from API.
- [ ] Create Student and Teacher; verify correct role/profile and persisted rows.
- [ ] Create semester and curriculum subject; map subject to semester.
- [ ] Allocate an eligible Student and verify history.
- [ ] Create and process enrollment request; verify status, reviewer/time and allocation/history transaction.
- [ ] Confirm unauthorized Student/Teacher cannot view Admin pages or call Admin APIs.
- [ ] Confirm deactivation/deletion UI behavior matches confirmed policy; deletion is permanent.

## Teacher browser workflow

- [ ] Teacher can sign in and see only owned offerings.
- [ ] Create offering only from an active mapped subject/semester; test duplicate conflict and cross-Teacher independence.
- [ ] Create/update/delete material; upload/download access remains protected.
- [ ] Create/publish assignment; eligible Student can submit once within its window.
- [ ] Teacher cannot see another Teacher’s offering/submissions.
- [ ] Grade submission; grade cannot exceed maximum and Student sees grade/feedback only after grading.
- [ ] Save/open Google Forms metadata. Confirm whether any quiz attempt/result features are outside scope.
- [ ] Create attendance session; mark eligible Student; correct record and verify updated timestamp.
- [ ] Deactivate/delete offering only according to confirmed policy; shared files remain while referenced.

## Student browser workflow

- [ ] Inactive, unadmitted or unauthorized Student cannot access protected pages/APIs.
- [ ] Student sees active semester options and can submit one pending enrollment request.
- [ ] Student can withdraw a pending request and then submit another; approved/rejected requests cannot be withdrawn.
- [ ] Student sees only active offerings matching their current eligible semester.
- [ ] Student downloads permitted materials and is denied another offering’s files.
- [ ] Student can create/update draft then submit within assignment window; cannot submit twice.
- [ ] Student cannot see another Student’s work or ungraded feedback.
- [ ] Student sees published Google Forms link and own attendance.

## Data integrity and authorization

- [ ] Run npm test against the isolated harness; record test count/result.
- [ ] Run npm run test:browser in actual browser; record browser/version and diagnostics.
- [ ] Verify expected 401/403 responses for unauthorized roles and ownership boundaries.
- [ ] Verify database rows persist in the isolated test schema, not only in the page.
- [ ] Verify allocation plus history and enrollment approval roll back together on injected failure.
- [ ] Verify Student, Teacher and offering deletion scopes independently.
- [ ] Verify failed file cleanup returns a non-success response and retry completes; retained shared files are not removed.
- [ ] Verify no test schema or temp files remain after normal completion; inspect leftovers before any cleanup.
- [ ] Confirm the development database remains at 19 tables unless an approved migration changes it.

## Frontend and integration

- [ ] Keep active HTML scripts wired to api-client.js, auth-guard.js and the API-backed role modules.
- [ ] Do not re-enable legacy localStorage modules as the source of authoritative identity or course data.
- [ ] Check loading, empty, validation, conflict, session-expired and API failure states.
- [ ] Check browser console and network; distinguish expected authorization denials from unexpected failures.
- [ ] Check keyboard/label behavior and small-screen layout for changed pages.
- [ ] Confirm CORS origin exactly matches the deployed frontend URL; unsafe requests send CSRF.

## Deployment and submission readiness

- [ ] Confirm target host, HTTPS, frontend origin, API URL and secure cookie behavior behind proxy.
- [ ] Provision least-privilege runtime DB credentials; separate test/production credentials and data.
- [ ] Provide a reviewed versioned schema/migration baseline before any fresh deployment.
- [ ] Define backup/restore for both MySQL and private file storage; test recovery.
- [ ] Choose durable private storage for deployment if local disk is not durable; implement/verify adapter only if approved.
- [ ] Set protected environment variables; verify .env is ignored and no secret appears in logs/build artifacts.
- [ ] Confirm upload limits, rate limiting, monitoring, cleanup retry visibility and operational ownership.
- [ ] Review known limits: Google Forms only stores links/metadata; no quiz attempts/results; no automatic localStorage migration; no assignment reference attachment relation.
- [ ] Review focused diff, branch status and test output with reviewer.
- [ ] Commit only the intended files on the feature branch; do not commit or push without team authorization.

## Scope that still needs confirmation

- [ ] Get an explicit Batch 4 feature list. The audit does not establish one.
- [ ] Confirm whether cloud storage, assignment attachments, quiz analytics, notifications, data migration, or deployment are in Batch 4. These are not implied requirements.
- [ ] Confirm production retention/audit requirements before changing permanent deletion behavior.
# Proposed future work: Batch 4 task breakdown

**Status:** Batch 4 / Phase 4 was not undertaken. This document proposes possible work organization only; it is not an approved feature specification.

## Scope warning

No owner-approved Batch 4 feature list or acceptance criteria was found in the repository/handover docs. This is a proposal for organizing final integration, testing, bug fixing and submission work. The friends receiving the project should get the owner’s approval before treating a row as a requirement.

| Proposed workstream | Suggested owner | Dependency and likely files | Tests and proposed acceptance |
|---|---|---|---|
| Scope and acceptance | Team lead + owner | Owner decision; update checklist only after approval. | Each approved task has scope, owner, dependency, test and acceptance outcome. |
| Reproducible schema setup | Developer A if approved | Owner-approved DDL/migration is required; new SQL/migration artifacts and perhaps tests/harness. Existing database has 19 tables but no DDL checked into repo. | Build a disposable schema from approved DDL; verify tables/FKs/indexes and run tests. No production DDL changes without approval. |
| Integration bug fixes | Developer B if approved | Only confirmed defects; likely relevant frontend page module and matching API/service, plus regression test. | Reproduce defect, add focused regression test, verify browser console/network and role access. No speculative redesign. |
| Test coverage and E2E | Shared or assigned test owner | backend/tests/auth-admin.test.js, academic-workflows.test.js, browser.e2e.js and harness.js. | Isolated-schema API tests and actual browser workflow; report browser/version, persistence and diagnostics. |
| Deployment and recovery readiness | Owner + deployment developer, if approved | Target host, TLS/proxy, DB provisioning, backup and storage choice must be decided. | Staging smoke test; verify secure cookies/CORS, DB+file backup and restore, monitoring and cleanup retry behavior. |
| Cloud storage | Only if approved | Select provider and credential policy first; backend/src/storage/index.js, new adapter, env example and tests. | Provider contract, private authorization, shared reference retention and retry tests. |
| Assignment reference attachments | Only if approved | Existing schema has no assignment attachment relation; requires reviewed schema/API/frontend changes. | Verify Teacher ownership, Student visibility policy, file lifecycle/deletion and migration. |
| Rich quiz reporting | Only if approved | Current system stores Google Forms links/metadata; Google access/API and privacy decisions needed. | Test the specifically approved external behavior; live Forms submissions/results are unverified. |
| Submission package/handover | Documentation/release owner | Confirm required deliverables with owner; docs/project-audit and approved release files. | New teammate reproduces setup/tests; reviewer checks evidence and approved acceptance list. |

## Suggested split (proposal)

- Friend A: schema reproducibility/deployment checks only if owner includes them.
- Friend B: confirmed UI/API integration issues and browser test additions.
- Pair: scope, cross-feature review, final regression run and handover.
Avoid parallel edits to shared route/service/schema files. Assign a single owner before touching shared contracts.

## Dependencies and risks

- Batch scope is an owner decision.
- The 19-table DDL is not checked in; obtain approved provisioning artifacts.
- Git status currently errors: “this operation must be run in a work tree”. Worktree cleanliness is unknown; repair/understand before branching.
- Tests use a source DB for SHOW CREATE TABLE, then create/drop generated learnspace_test_b04_* schemas. Use dedicated development credentials.
- Deletion commits database changes before physical-file cleanup completes; cleanup failures return 503 and retry.
- Storage adapter is local only. Google Forms test checked link navigation through controlled test routing, not actual Google service submission/results.
- No assignment reference attachment relationship; only material and Student submission file associations are modeled.
- Deployment, backups and restoration have not been verified.

## Suggested sequence after approval

1. Write down owner-approved Batch 4 tasks and acceptance.
2. Resolve Git status and record branch/base/starting commit.
3. Provision approved disposable schema/test access.
4. Implement approved DB/service work first, then routes/controllers and frontend integration.
5. Add isolated integration and actual browser tests per task.
6. Run npm test and npm run test:browser; review persistence, console/network and role boundaries.
7. Review docs, environment safety, deployment/recovery if in scope, and final PR diff.
8. Obtain review before merge or release.
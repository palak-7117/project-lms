# Batch 4 project handoff

Batch 2 and Batch 3 are complete in the current source. Batch 4 / Phase 4 was deliberately not undertaken and belongs to the receiving developers. No approved Batch 4 feature specification was found; obtain owner priorities and acceptance criteria before implementation. BATCH_4_TASK_BREAKDOWN.md contains proposed workstreams only.

## Product and architecture

LearnSpace has Admin, Teacher and Student roles. Admin provisions accounts and academic eligibility. Teachers create owned offerings for active official subject/semester mappings and manage materials, assignments, grading, Google Forms link metadata and attendance. Students request allocation and access active offerings matching their current semester.

The frontend is static HTML/CSS/JavaScript. Current role pages load API-backed scripts and frontend/api-client.js. Request path: browser fetch with cookies/CSRF → Express app → route authentication/role middleware → controller → service validation and parameterized SQL/transaction → mysql2 pool and MySQL; file bytes pass through a private storage adapter. Keep identity and authoritative course data on the server. Older localStorage scripts remain; do not wire them back as authoritative state.

Useful code locations:
- backend/src/server.js and app.js: process startup and Express.
- backend/src/config/{env,db,auth}.js: origins, mysql pool, cookies/tokens.
- backend/src/routes, controllers, services, middleware: endpoint layers.
- backend/src/utils/transaction.js: commit/rollback helper.
- backend/src/storage/{index,local}.js: private files.
- frontend/api-client.js, auth-guard.js, script.js and active *-backend.js page modules.
- backend/tests: isolated integration and browser workflows.

Auth uses Argon2id passwords, opaque session cookies with only token hashes in user_sessions, session expiry/revocation, role middleware and CSRF checks for unsafe requests. Success envelope is generally {success:true,data}; errors are {success:false,error,code}. See API_REFERENCE.md for endpoints.

## Database

Read-only metadata inspection confirms 19 InnoDB tables using utf8mb4_0900_ai_ci. users has one-to-zero-or-one Student/Teacher profile; semester_subjects joins academic masters; offerings link Teacher, subject and original semester; offerings own materials, assignments, quizzes and attendance sessions; submissions and attendance records connect Students to course work; file_assets are referenced by materials/submission files; user_sessions belong to users. DATABASE_AUDIT.md contains constraints and deletion rules.

There is no checked-in DDL or migration baseline. A fresh checkout cannot build the approved schema by itself. Ask the owner for the approved schema/backup and provisioning procedure. Do not infer that an empty learnspace_db is initialized.

## Completed and limitations

Completed in source: B0.4 Express/MySQL foundation; Batch 2 authentication, Admin and academic management; Batch 3 Teacher offerings/content and Student workflows, submissions/grades, Forms metadata, attendance, protected file access and scoped deletion.

Known limits: local-only file provider; no assignment reference attachment relationship (Student submission attachments and material files exist); Google Forms is links/metadata only, with no in-app questions/attempts/results; live Google Forms submission/result behavior was not verified; no localStorage migration; no verified production deployment or backup/restore process.

Existing docs report npm test with 11/11 passing and browser E2E passing in Chrome 157 after bundled Chromium launch failed. These are historical results, not rerun during this handover review.

## Windows setup

Install MySQL Server 8.x and MySQL Workbench. Workbench is the GUI client; Server is the service. Start the MySQL service from Windows Services or your approved local setup. Connect through Workbench using your local connection profile. Confirm the owner supplied learnspace_db with its approved 19 tables. No checked-in schema script exists; request the approved DDL/backup instead of inventing tables. Use a dedicated development DB account; tests require reading source DDL and create/drop permission for generated test schemas.

From PowerShell:
~~~
cd C:\Users\PALAK PANWAR\project-lms\backend
npm ci
Copy-Item .env.example .env
notepad .env
~~~
Set local DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME=learnspace_db, PORT=5000, HOST=127.0.0.1, FRONTEND_ORIGIN, FILE_STORAGE_DIR and FILE_STORAGE_PROVIDER=local. Never share or commit .env.

Bootstrap only the first Admin, when none exists, in an interactive terminal:
~~~
npm run bootstrap:admin
~~~

Start backend in terminal one:
~~~
npm run dev
~~~
Health: http://127.0.0.1:5000/api/health and /api/health/db.

Start frontend in terminal two:
~~~
cd C:\Users\PALAK PANWAR\project-lms\frontend
python -m http.server 5500
~~~
Open http://127.0.0.1:5500/index.html. If Python is unavailable, use an approved static server and update exact FRONTEND_ORIGIN.

Run from backend:
~~~
npm test
npm run test:browser
~~~
Tests clone DDL into learnspace_test_b04_* and write there, then remove that test schema. They need create/drop DB permission. Never configure tests to write into a live development/production schema. Inspect leftovers after interruption before cleanup.

## Git and safe collaboration

Current observed branch is backend-foundation at 4d50f73 (“Implement teacher and student academic workflows”); parent 3f1b5e5 is the auth/Admin implementation. main and origin/main were at 87f788f. Local branch names observed: admin, backend-foundation, backend-setup, main, teacher. Remotes observed include origin/integration/teacher-student and role branches. These refs may have changed since inspection.

Git status currently fails with “this operation must be run in a work tree”; working-tree cleanliness is unknown. Resolve this before branching or editing. Then record status/log, agree on base branch, create one feature branch per approved task, review diff, run targeted plus regression tests, and submit a PR against agreed base. Do not reset/clean, force-push, modify shared branches or alter schema without approval. See BATCH_4_TASK_BREAKDOWN.md for proposed work ownership.

## Handover blockers and completion

Owner must confirm Batch 4 scope, target/deployment, approved DB provisioning and any schema/file/Google integration changes. Before accepting handover, a teammate should be able to install dependencies, configure private env, connect to provided schema, bootstrap (if needed), start backend/frontend, run isolated tests, complete role workflows and review a readable Git diff. Keep batch checklist and task breakdown as proposed until owner approves them.
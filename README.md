# LearnSpace

LearnSpace is an academic Learning Management System project developed in two related tracks: a browser frontend that originally stores data in localStorage, and a Node.js/Express/MySQL backend with API-connected workflows.

> **Project status:** The localStorage frontend and the API-backed backend/frontend workflows were developed and tested in their respective development environments. They have not been completed as one reproducible, unified fresh-machine deployment. Batch 4 / Phase 4 final integration and production deployment were deliberately not undertaken. This repository is an academic development project, not a production-ready release.

## Project objectives

LearnSpace models academic course delivery for three roles:

- **Admin:** provision Students and Teachers; manage admission and authorization; create semesters and official curriculum subjects; map subjects to semesters; allocate Students; review enrollment requests.
- **Teacher:** create independent offerings from official mapped subjects and semesters; add materials and assignments; review and grade submissions; store Google Forms quiz metadata; manage attendance.
- **Student:** request semester enrollment; view eligible offerings; access materials; submit assignment files; see returned grades and feedback; view attendance.

## Two implementation tracks

| Track | Technologies | Persistence and scope |
|---|---|---|
| Original frontend | HTML, CSS, JavaScript | Older role/course modules use localStorage. These remain in the repository as a separate implementation. |
| Backend-connected workflows | HTML, CSS, JavaScript + Node.js, Express, mysql2, MySQL | Current page entry points load API-backed modules. Data is read/written through the REST API and MySQL; files use private local storage. |

The tracks are related, but localStorage data is not automatically migrated to MySQL. A completed, reproducible unified deployment is out of scope and has not been verified. Do not interpret test success in one track as evidence that every legacy page/module has been integrated.

## Backend architecture

The backend is a REST-style Express API. The request path is:

~~~text
Browser page → frontend/api-client.js fetch → Express app → route middleware
→ controller → service validation/business rules → mysql2 pool → MySQL
→ JSON response → frontend renders refreshed state
~~~

- **Routes** register URL/method and attach authentication, role and CSRF middleware.
- **Middleware** validates session cookies, role access, CSRF tokens, uploads and errors.
- **Controllers** translate HTTP parameters/body into service calls and response envelopes.
- **Services** own business rules, authorization by resource ownership/eligibility, validation, SQL and transactions.
- **mysql2/promise** uses a connection pool configured in backend/src/config/db.js.
- **Storage adapter** uses backend/src/storage/index.js and a local private-file implementation.

Primary route groups: /api/health, /api/auth, /api/admin, /api/student, /api/teacher and /api/files. The detailed endpoint inventory is in [API_REFERENCE.md](docs/project-audit/API_REFERENCE.md).

## Database

The audited MySQL database learnspace_db contains 19 InnoDB tables using utf8mb4_0900_ai_ci. The schema includes:

~~~text
users, student_profiles, teacher_profiles, user_sessions,
semesters, curriculum_subjects, semester_subjects,
student_semester_history, student_enrollment_requests,
offerings, materials, assignments, assignment_submissions,
submission_files, quizzes, attendance_sessions, attendance_records,
file_assets, file_cleanup_jobs
~~~

Important relationships include:

- A user has at most one Student or Teacher profile.
- semesters and curriculum_subjects are many-to-many through semester_subjects.
- An offering belongs to one Teacher and stores its subject and semester snapshot.
- Offerings own materials, assignments, quizzes and attendance sessions.
- assignment_submissions connect one Student to one assignment; the unique pair prevents duplicate submission rows.
- attendance_records connect a Student to an attendance session.
- file_assets are associated with materials/submissions and are cleaned up only when unreferenced.
- user_sessions belong to users and store a hash of the session token.

See [DATABASE_AUDIT.md](docs/project-audit/DATABASE_AUDIT.md) for columns, indexes, constraints and delete rules.

**Schema setup limitation:** no checked-in SQL DDL or migration file was found. The repository's backend/database/migrations and seeds directories contain no SQL source files. A new developer needs the approved schema artifact/provisioning instructions from the project owner. Do not create tables from memory or point tests at real data.

## Authentication and security

The API uses Argon2id password hashes; passwords are not stored as plaintext. Login issues a random opaque session cookie while MySQL stores its SHA-256 token hash in user_sessions. Middleware checks expiry, revocation, account status and (for Students) admission/authorization. Role middleware protects Admin, Teacher and Student routes. Unsafe requests require CSRF validation; CORS uses explicit configured origins. Helmet adds HTTP security headers.

These are source-level controls, not a production security certification. Deployment, HTTPS/proxy settings, rate limiting, monitoring and recovery have not been verified. Details and findings: [SECURITY_AND_TESTING_AUDIT.md](docs/project-audit/SECURITY_AND_TESTING_AUDIT.md).

## File handling

Multer accepts bounded multipart uploads, checks extension and content signature, and the service creates a server-generated storage key and metadata record. Bytes are stored outside the frontend's public directory. GET /api/files/:fileId checks role, ownership or Student eligibility before streaming. Cleanup jobs retry deletion after references are removed.

Only the local provider is implemented. There is no assignment reference-attachment relationship in the schema; current file workflows cover course materials and Student submission attachments. Cloud storage and durable production file operations are not verified.

## Recorded testing evidence

The existing audit recorded:

- **npm test:** 11 tests passed, 0 failed, using isolated generated MySQL test schemas.
- **npm run test:browser:** Playwright workflow passed in installed Chrome 157 after bundled Chromium launch failed. The run covered Admin, Teacher and Student flows, role denials and browser diagnostics.
- The Google Forms browser check used a controlled test route; it did not verify actual Google Forms submissions or results.

These are previously recorded results, not tests rerun while preparing this README. The test harness reads DDL from the configured learnspace_db, creates a generated learnspace_test_b04_* schema for test writes, and drops it on normal completion. Use a dedicated development MySQL account and inspect for leftovers after interrupted runs.

## Repository structure

~~~text
project-lms/
  README.md
  .gitignore
  frontend/
    index.html, style.css, script.js
    admin-dashboard.html, admin-dashboard-api.js, admin-dashboard.js
    teacher-dashboard.html, teacher-dashboard-backend.js, teacher-dashboard.js
    course-detail.html, teacher-course-backend.js, course-detail.js
    student_courses.html, student-courses-backend.js, student-enrollment.js
    course_details.html, student-course-backend.js, course_details.js
    api-client.js, auth-guard.js, role-access modules, assets/
  backend/
    .env.example, .gitignore, package.json, package-lock.json
    src/app.js, src/server.js
    src/config/, routes/, controllers/, services/, middleware/
    src/storage/, utils/, scripts/bootstrap-admin.js
    tests/ (integration tests, browser.e2e.js, browser-session.js, harness.js)
  docs/project-audit/
    implementation, architecture, database, API, security and handover guides
~~~

## Local development setup

These instructions start the backend-connected workflows. The original localStorage frontend remains available as a separate implementation.

Prerequisites: Windows, Node.js/npm, MySQL Server 8.x, MySQL Workbench, and Python (or another static file server). Workbench is the database client; MySQL Server runs the database. Clone/open the repository in a local path, then use two PowerShell terminals.

1. Ask the project owner for the approved `learnspace_db` schema artifact or a provisioned development database. No schema DDL is included in this repository. Start MySQL Server, then use Workbench to confirm the owner-provisioned database and approved tables exist. Do not execute unreviewed DDL.
2. In the first PowerShell terminal, from the repository root:

~~~powershell
cd .\backend
npm ci
Copy-Item .env.example .env
notepad .env
~~~

3. Review `.env.example` and fill `.env` with local values for `DB_HOST`, `DB_PORT`, `DB_USER` and `DB_PASSWORD`. The example already sets local defaults for `DB_NAME=learnspace_db`, `PORT=5000`, `HOST=127.0.0.1`, the exact frontend origins, and the private local storage directory/provider. Use a dedicated development account with only the privileges needed for the application and isolated test schemas. Keep `.env` private; never commit or share it.
4. Bootstrap the first Admin only when the configured database currently has no Admin account. Run this once from the backend directory in an interactive terminal:

~~~powershell
npm run bootstrap:admin
~~~

The script prompts for the Admin display name and email, then asks for a password and confirmation without echoing the password. It enforces password validation, hashes it with Argon2id, and refuses to run if an Admin already exists. If an Admin is already present, skip this step.

5. Start the backend in the first terminal:

~~~powershell
npm run dev
~~~

6. In the second PowerShell terminal, from the repository root, serve the frontend:

~~~powershell
cd .\frontend
python -m http.server 5500
~~~

7. Open `http://127.0.0.1:5500/index.html`. The backend health endpoints are `http://127.0.0.1:5000/api/health` and `http://127.0.0.1:5000/api/health/db`.

Run automated tests from a third terminal, using the backend directory:

~~~powershell
cd .\backend
npm test
npm run test:browser
~~~

The browser test requires a running MySQL server and permission for the harness to create and drop generated `learnspace_test_b04_*` schemas. It copies schema definitions from the configured database and writes test data only to the generated schema. Use a dedicated development MySQL account, never production credentials or data. After an interrupted run, check for leftover generated test schemas before continuing.

## Implementation status and limitations

**Implemented in source:** backend foundation; authentication and Admin/academic workflows; Teacher and Student API-connected workflows; scoped data deletion and private file cleanup. The original localStorage frontend remains as a related implementation.

**Not completed or not verified:**

- Batch 4 / Phase 4 final integration and production deployment were not undertaken.
- LocalStorage data is not migrated to the backend.
- No checked-in schema DDL/migration baseline.
- File provider is local only; production backup/restore and durable storage not verified.
- Assignment reference attachments are not modeled.
- Google Forms is metadata/link only; live external submission/results are unverified.
- Deployment, monitoring and recovery procedures are not verified.
- Git working-tree status currently fails with “this operation must be run in a work tree”; do not assume the checkout is clean.

## Documentation

- [Project overview](docs/project-audit/PROJECT_OVERVIEW.md)
- [Implementation audit](docs/project-audit/IMPLEMENTATION_AUDIT.md)
- [Database audit](docs/project-audit/DATABASE_AUDIT.md)
- [API reference](docs/project-audit/API_REFERENCE.md)
- [Beginner backend guide](docs/project-audit/BACKEND_LEARNING_GUIDE.md)
- [Architecture and data flow](docs/project-audit/DATA_FLOW_AND_ARCHITECTURE.md)
- [Security and testing audit](docs/project-audit/SECURITY_AND_TESTING_AUDIT.md)
- [Batch 4 handoff](docs/project-audit/PROJECT_HANDOFF_BATCH_4.md)
- [Team handover guide](docs/project-audit/TEAM_HANDOVER_GUIDE.md)
- [Proposed Batch 4 task breakdown](docs/project-audit/BATCH_4_TASK_BREAKDOWN.md)
- [Batch 4 checklist](docs/project-audit/BATCH_4_CHECKLIST.md)
- [Audit documentation index](docs/project-audit/README.md)

## Suggested screenshots for academic presentation

Capture non-sensitive screenshots from a clean demo/test dataset:
1. Landing page with the three role choices.
2. Admin dashboard showing semester/curriculum setup.
3. Teacher offering and course-material/assignment management.
4. Student eligible course view and assignment status.
5. A browser test/report excerpt showing the tested workflows.

Do not include real student data, emails, passwords, session cookies, or private file URLs. No screenshots are included currently.

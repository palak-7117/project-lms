# Project overview

## Purpose and roles

LearnSpace is a static browser LMS with Admin, Teacher and Student roles. Admin creates accounts, reviews admission/authorization, manages semester and official curriculum records, maps subjects to semesters and allocates Students. A Teacher offers an officially mapped subject/semester as a section and manages its materials, assignments, grading, Google Forms metadata and attendance. A Student requests enrollment and accesses offerings matching their current eligible semester.

## Repository layout

~~~text
project-lms/
  README.md, .gitignore
  frontend/  HTML/CSS/JS, backend API client and role pages, legacy localStorage modules
  backend/
    package.json, package-lock.json, .env.example
    src/{app.js,server.js}
    src/config/{env.js,db.js,auth.js}
    src/routes/, controllers/, services/, middleware/, storage/, utils/
    src/scripts/bootstrap-admin.js
    tests/{harness.js,auth-admin.test.js,academic-workflows.test.js,browser.e2e.js,browser-session.js}
~~~

No root package.json or checked-in SQL DDL file was found. The live DB schema is the current auditable schema source; tests clone it with SHOW CREATE TABLE.

## Architecture

Frontend is plain HTML/CSS/JavaScript served separately. frontend/api-client.js uses fetch, JSON or FormData, credentials: include, and an X-CSRF-Token on mutating requests. Express mounts endpoints under /api. Routes attach authentication, role and CSRF middleware. Controllers bind request and response shapes. Services validate business rules and execute parameterized SQL through mysql2/promise. Private file bytes live outside the public frontend tree; file metadata/references live in MySQL.

~~~mermaid
flowchart LR
  UI[Browser pages] -->|fetch, cookie, CSRF| E[Express]
  E --> R[Routes and middleware]
  R --> C[Controllers]
  C --> S[Services and transactions]
  S --> P[mysql2 pool]
  P --> DB[(learnspace_db)]
  S --> FS[Private storage adapter]
~~~

## Technologies

Node.js/CommonJS; Express 5; mysql2/promise; MySQL 8; dotenv; Helmet; CORS; Argon2; Multer; nodemon; Playwright. Frontend: HTML, CSS, JavaScript. Live DB metadata reports 19 InnoDB tables, utf8mb4_0900_ai_ci. Storage implementation is local-only behind a provider interface.

## Starting locally

From backend: npm ci; create backend/.env from backend/.env.example and set local DB values; npm run dev. In a second terminal, serve frontend files, e.g. python -m http.server 5500 from frontend. Expected API base is http://127.0.0.1:5000/api. Check /api/health and /api/health/db. For production use npm start with secure deployment configuration and HTTPS. Never copy .env into docs or commits.

## Current page wiring and persistence

Current HTML loads API-backed modules:
- Admin: admin-dashboard.html → api-client.js, auth-guard.js → admin-dashboard-api.js.
- Teacher dashboard/course: teacher-dashboard.html/course-detail.html → teacher-dashboard-backend.js/teacher-course-backend.js.
- Student courses/course detail: student_courses.html/course_details.html → student-courses-backend.js/student-enrollment.js and student-course-backend.js.
- Login: index.html → api-client.js and script.js.

Older localStorage modules remain in the repository. They are not selected by these current entry-point script tags but can be accidentally reconnected. Existing browser data is not automatically migrated to MySQL.

## Implementation tracks and project status

The localStorage frontend and API-connected backend workflows are separate related implementations. Final unified integration and reproducible fresh-machine deployment were not completed. Batch 4 / Phase 4 was deliberately not undertaken; proposed tasks remain subject to owner approval.

## Feature boundaries

Google Forms is an external quiz engine; LearnSpace stores its metadata/link, not questions or quiz attempts/results. File abstraction has only a local adapter. Tests pass in isolated schemas, not proof of production readiness.
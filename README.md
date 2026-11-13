# LearnSpace LMS

## Project Overview

LearnSpace is a Learning Management System (LMS) for managing academic terms, curriculum, course offerings, learning activities and student progress. Its role-based frontend communicates with a Node.js and Express API backed by MySQL.

The application supports three roles:

- **Admin** manages student and teacher accounts, admission and authorization, semesters, official curriculum mappings, student semester allocations and enrollment requests.
- **Teacher** creates offerings from the official curriculum, manages course materials and assignments, reviews submissions, records grades, stores Google Forms quiz links/metadata and manages attendance.
- **Student** requests enrollment, views eligible offerings and course content, submits assignment work, views grading feedback and checks attendance.

## Technology Stack

| Area | Technologies and tools in the repository |
|---|---|
| Frontend | HTML, CSS, browser JavaScript and Fetch API for API-connected pages |
| Backend | Node.js, Express.js 5 |
| Database | MySQL; `mysql2` promise driver and connection pool |
| Configuration and security | `dotenv`, `helmet`, `cors`, `argon2` |
| Uploads and files | `multer`, private local filesystem storage |
| Development and tests | `nodemon`, Playwright, Node.js built-in test runner |

## Backend Architecture

The backend request path is:

~~~text
Frontend → API request → Express route → middleware → controller → service → MySQL
                                                                  ↓
Frontend ← JSON response ←────────────────────────────────────────┘
~~~

- **Frontend API client** (`frontend/api-client.js`) sends requests with `fetch`, credentials and CSRF headers where needed. API-connected role pages render responses from the backend.
- **Express app and routes** (`backend/src/app.js`, `backend/src/routes/`) register API paths and HTTP methods. Each route connects middleware to a controller action.
- **Middleware** (`backend/src/middleware/`) checks sessions and roles, verifies CSRF tokens, processes uploads and formats not-found or error responses. `asyncHandler` forwards rejected asynchronous controller calls to centralized error handling.
- **Controllers** (`backend/src/controllers/`) read request parameters, authenticated user data and `req.body`, call service functions, and return JSON responses.
- **Services** (`backend/src/services/`) validate inputs, apply application rules and resource ownership/eligibility checks, run SQL through the database module, and use transactions for related operations.
- **Database module** (`backend/src/config/db.js`) configures a `mysql2/promise` connection pool for service queries.
- **File storage** (`backend/src/storage/`) selects the local provider. File routes authorize access before serving private stored content.

The API is mounted under `/api`; its route groups are health, authentication, admin, student, teacher and files.

## Database Design

The application source refers to the 19-table MySQL schema used by LearnSpace:

~~~text
users, student_profiles, teacher_profiles, user_sessions,
semesters, curriculum_subjects, semester_subjects,
student_semester_history, student_enrollment_requests,
offerings, materials, assignments, assignment_submissions,
submission_files, quizzes, attendance_sessions, attendance_records,
file_assets, file_cleanup_jobs
~~~

The relationships represented in service queries include:

- `users` is joined to the role-specific `student_profiles` and `teacher_profiles`; sessions in `user_sessions` refer to users.
- `semester_subjects` connects semester records and official curriculum subjects. Student allocations and history use student profiles and semesters; enrollment requests record a student's request and its review.
- `offerings` are created by teachers from curriculum/semester information. Materials, assignments, quizzes and attendance sessions are queried in the context of an offering.
- `assignment_submissions` associate students with assignments; `submission_files` and `file_assets` support uploaded-file metadata and associations.
- `attendance_records` are queried by attendance session and student.

**Schema source limitation:** no database DDL or migration baseline is checked into this repository. The source queries show the table joins and key relationships used by the application, but the actual foreign-key declarations, indexes and full column definitions cannot be independently verified from the checked-in files. The existing database must be provisioned separately; do not infer or recreate its schema from this summary.

## API Documentation

All paths below are mounted under `/api`. Admin routes require an authenticated Admin session. Teacher and Student route groups require the corresponding role. State-changing requests are protected by CSRF middleware as declared in the route files. `{id}` parameters are path values.

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/auth/csrf` | Issue a CSRF token and cookie. |
| POST | `/api/auth/:role/login` | Sign in for the requested role (`admin`, `teacher` or `student`). |
| GET | `/api/auth/me` | Return the current authenticated user. |
| POST | `/api/auth/logout` | Revoke the current session and clear its cookies. |

### Admin

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/admin/summary` | Dashboard summary. |
| GET, POST | `/api/admin/students` | List students; create a student. |
| GET, DELETE | `/api/admin/students/:profileId` | Get or permanently delete a student profile through the deletion service. |
| PATCH | `/api/admin/students/:profileId/admission` | Update admission status. |
| PATCH | `/api/admin/students/:profileId/authorization` | Update authorization status. |
| POST | `/api/admin/students/:profileId/allocation` | Allocate a student to a semester. |
| GET, POST | `/api/admin/teachers` | List teachers; create a teacher. |
| GET, DELETE | `/api/admin/teachers/:profileId` | Get or permanently delete a teacher profile through the deletion service. |
| PATCH | `/api/admin/users/:userId` | Update user details. |
| PATCH | `/api/admin/users/:userId/status` | Update account status. |
| GET, POST | `/api/admin/semesters` | List or create semesters. |
| PATCH | `/api/admin/semesters/:semesterId` | Update a semester. |
| GET, POST | `/api/admin/curriculum-subjects` | List or create official curriculum subjects. |
| PATCH | `/api/admin/curriculum-subjects/:subjectId` | Update a curriculum subject. |
| POST, DELETE | `/api/admin/semesters/:semesterId/subjects/:subjectId` | Add or remove a subject mapping for a semester. |
| GET | `/api/admin/enrollment-requests` | List student enrollment requests. |
| PATCH | `/api/admin/enrollment-requests/:requestId/review` | Approve or reject a request. |

### Teacher

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/teacher/curriculum-subjects` | List curriculum subjects available for offerings. |
| GET, POST | `/api/teacher/offerings` | List or create the teacher's offerings. |
| GET, PATCH, DELETE | `/api/teacher/offerings/:offeringId` | View, update or delete an offering. |
| POST | `/api/teacher/offerings/:offeringId/materials` | Add a material, with optional single-file upload. |
| PATCH, DELETE | `/api/teacher/materials/:materialId` | Update or delete a material. |
| POST | `/api/teacher/offerings/:offeringId/assignments` | Create an assignment. |
| PATCH, DELETE | `/api/teacher/assignments/:assignmentId` | Update or delete an assignment. |
| GET | `/api/teacher/assignments/:assignmentId/submissions` | List submissions for an assignment. |
| PATCH | `/api/teacher/submissions/:submissionId/grade` | Grade a submission. |
| POST | `/api/teacher/offerings/:offeringId/quizzes` | Create Google Forms quiz metadata. |
| PATCH, DELETE | `/api/teacher/quizzes/:quizId` | Update or delete quiz metadata. |
| GET, POST | `/api/teacher/offerings/:offeringId/attendance-sessions` | List or create attendance sessions. |
| GET | `/api/teacher/offerings/:offeringId/eligible-students` | List eligible students for an offering. |
| GET | `/api/teacher/attendance-sessions/:sessionId/roster` | Get a session roster. |
| PUT | `/api/teacher/attendance-sessions/:sessionId/records/:studentProfileId` | Mark or update a student's attendance record. |

### Student

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/student/enrollment-options` | List semester enrollment options. |
| GET, POST | `/api/student/enrollment-requests` | List or create enrollment requests. |
| POST | `/api/student/enrollment-requests/:requestId/withdraw` | Withdraw an enrollment request. |
| GET | `/api/student/offerings` | List offerings available to the student. |
| GET | `/api/student/offerings/:offeringId` | Get offering content and related course information. |
| GET, POST | `/api/student/offerings/:offeringId/assignments/:assignmentId/submission` | Retrieve or submit assignment work; submission can include multiple files. |
| GET | `/api/student/offerings/:offeringId/attendance` | View attendance for an offering. |

### Health and Files

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Check that the API is responding. |
| GET | `/api/health/db` | Run a database `SELECT 1` health check. |
| GET | `/api/files/:fileId` | Download/stream an authorized file for a Teacher or eligible Student. |

The endpoint list is transcribed from `backend/src/routes/`; it describes route registration, while actual request validation and response fields are implemented in controllers and services.

## Implemented Features

### Batch B.0

- Express backend foundation with JSON request parsing, Helmet security headers, configured CORS, centralized not-found/error handling and health endpoints.
- `dotenv` configuration and a `mysql2/promise` connection pool for the existing MySQL database.
- Backend project scripts for development, server startup, Admin bootstrap, integration tests and browser tests.

### Batch 2

- Password-based login for Admin, Teacher and Student roles, persistent server-side sessions, current-user and logout flows.
- Admin account creation and management, student admission/authorization and semester allocation.
- Semester and official curriculum subject management, including semester-subject mappings.
- Student enrollment request creation/withdrawal and Admin review.

### Batch 3

- Teacher curriculum access and offering creation/management.
- Course material and assignment management, Student submissions and Teacher grading.
- Google Forms quiz metadata management.
- Attendance session creation, eligible-student rosters, attendance marking and Student attendance views.
- Student-facing offering/course content and restricted file upload/download workflows.

## Authentication and Security

- Passwords are hashed and verified with Argon2id using the `argon2` package.
- Login creates a cryptographically random opaque session token. The browser receives it in an HTTP-only cookie; MySQL stores its SHA-256 hash in `user_sessions`.
- Sessions have an eight-hour absolute lifetime and a 30-minute idle timeout. Logout revokes the server-side session. Middleware checks expiry, revocation and account status; Student access also checks admission and authorization state.
- Role middleware restricts Admin, Teacher and Student route groups. Services additionally check ownership and academic eligibility for resource-specific actions.
- Unsafe requests use a CSRF cookie/header token comparison, including a timing-safe comparison. The backend checks configured origins.
- CORS allows explicit origins from `FRONTEND_ORIGIN`; wildcard origins are rejected. Helmet sets HTTP security headers.
- Session cookies use `SameSite=Lax`; `Secure` is enabled in production, and the production cookie names use the `__Host-` prefix. The CSRF token cookie is readable by frontend JavaScript so it can be sent in the request header.
- Multer applies upload limits and file checks; stored file bytes are kept in a private local directory outside the static frontend root. File access is authorized before streaming.

These are implemented application controls; they do not establish that the application has been deployed or certified for production use.

## Project Setup and Installation

### Prerequisites

- Node.js and npm.
- MySQL Server 8.x and access to the existing, owner-provisioned LearnSpace database.
- MySQL Workbench is optional as a database client; it does not replace the MySQL Server.
- Python (or another static HTTP server) to serve the frontend pages locally.

### Install and configure

From the repository root, use PowerShell:

~~~powershell
cd .\backend
npm ci
Copy-Item .env.example .env
notepad .env
~~~

Set local `DB_HOST`, `DB_PORT`, `DB_USER` and `DB_PASSWORD` in `.env`. Review the other settings in `backend/.env.example`, including the database name, server host/port, allowed frontend origins and private local file-storage path. Never commit `.env` or use production credentials for development or testing.

**Database prerequisite:** the backend connects to an existing database; this repository does not include a checked-in schema DDL or migration baseline. Obtain the approved schema or a provisioned development database from the project owner before starting the API. Do not create tables based only on this README.

If the configured database has no Admin account, create its first Admin once from an interactive terminal in the `backend` directory:

~~~powershell
npm run bootstrap:admin
~~~

The script prompts for a display name, email, password and confirmation; password input is not echoed. It refuses to create another Admin when one already exists.

### Start the backend and frontend

In the first PowerShell terminal, from `backend`:

~~~powershell
npm run dev
~~~

To use the frontend locally, open a second terminal at the repository root:

~~~powershell
cd .\frontend
python -m http.server 5500
~~~

Open `http://127.0.0.1:5500/index.html`. The default backend health URLs are `http://127.0.0.1:5000/api/health` and `http://127.0.0.1:5000/api/health/db` when using the example host and port settings.

The backend test commands, run from `backend`, are `npm test` and `npm run test:browser`. The tests require MySQL access; follow the test harness configuration and use an isolated development/test database account.

## Project Structure

~~~text
project-lms/
├── README.md
├── frontend/                 # Role pages, API client and API-connected scripts
├── backend/
│   ├── .env.example          # Environment variable names and non-secret defaults/placeholders
│   ├── package.json          # Runtime dependencies and npm scripts
│   ├── src/
│   │   ├── app.js, server.js # Express setup and server entry point
│   │   ├── config/           # Environment, MySQL pool and authentication configuration
│   │   ├── routes/           # API route declarations
│   │   ├── middleware/       # Authentication, roles, CSRF, uploads and error handling
│   │   ├── controllers/      # HTTP request/response handlers
│   │   ├── services/         # Application rules, SQL and transactions
│   │   ├── storage/          # Private local file storage adapter
│   │   ├── scripts/          # One-time Admin bootstrap
│   │   └── utils/            # Shared validation and request helpers
│   └── tests/                # Node integration tests and Playwright browser workflow
└── .gitignore
~~~

## Conclusion

LearnSpace provides an Express and MySQL backend for role-based authentication, Admin academic management, Teacher course workflows and Student learning workflows through its API-connected frontend.

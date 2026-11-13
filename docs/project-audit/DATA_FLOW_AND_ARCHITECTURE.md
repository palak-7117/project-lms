# Data flow and architecture

## 1. Overall system

~~~mermaid
flowchart LR
  B[Browser: HTML CSS JS] -->|fetch /api, JSON or multipart| APP[Express app]
  APP --> SEC[Helmet, exact CORS, parsers]
  SEC --> ROUTE[Router and middleware]
  ROUTE --> CTRL[Controller]
  CTRL --> SVC[Service and validation]
  SVC -->|prepared SQL| POOL[mysql2 pool]
  POOL --> DB[(MySQL learnspace_db)]
  SVC -->|private file API| STORE[Local storage provider]
~~~

## 2. Frontend-to-backend request

~~~mermaid
sequenceDiagram
  participant UI as Page module
  participant API as LearnSpaceApi
  participant E as Express route
  participant M as Auth/role/CSRF middleware
  participant C as Controller
  participant S as Service
  participant DB as MySQL
  UI->>API: get/post(path, body)
  API->>API: add credentials; CSRF header for unsafe method
  API->>E: HTTP request under /api
  E->>M: route middleware
  M->>DB: validate session/role (as applicable)
  M->>C: allow request
  C->>S: pass trusted actor, params and body
  S->>DB: parameterized SQL, maybe transaction
  DB-->>S: rows/affected count
  S-->>C: result
  C-->>API: {success:true,data}
  API-->>UI: data or ApiError
~~~

## 3. Authentication and session

~~~mermaid
sequenceDiagram
  participant Browser
  participant Auth as /api/auth
  participant DB as users and user_sessions
  Browser->>Auth: GET /csrf
  Auth-->>Browser: CSRF cookie + token JSON
  Browser->>Auth: POST /:role/login with cookie and X-CSRF-Token
  Auth->>DB: lookup user by email
  Auth->>Auth: Argon2id verify and role eligibility
  Auth->>DB: insert session id and SHA-256 token hash
  Auth-->>Browser: HttpOnly session cookie, readable CSRF cookie, public user data
  Browser->>Auth: GET /me with cookie
  Auth->>DB: validate revocation, absolute expiry and 30-min idle window
  Auth-->>Browser: role/profile authorization data
  Browser->>Auth: POST /logout + CSRF
  Auth->>DB: set revoked_at; clear cookies
~~~

Session settings are in backend/src/config/auth.js and the validation query is backend/src/middleware/requireAuth.js. Student sign-in also requires admitted + authorized; Teacher requires a profile; every role requires active account status.

## 4. Admin academic workflow

~~~mermaid
flowchart TD
  A[Admin signs in] --> G[auth-guard checks /auth/me role]
  G --> UI[admin-dashboard-api loads summary and directories]
  UI --> C1[Create Student/Teacher]
  C1 --> API1[POST /api/admin/students or /teachers]
  API1 --> S1[transaction inserts users and role profile]
  UI --> C2[Create semester and official subject]
  C2 --> API2[POST semesters and curriculum-subjects]
  API2 --> S2[insert master rows]
  UI --> MAP[Map subject to semester]
  MAP --> API3[POST semester/:id/subjects/:id]
  API3 --> S3[transaction locks active masters and inserts mapping]
  Student --> REQ[POST /api/student/enrollment-requests]
  REQ --> S4[lock Student; enforce eligibility and one pending request]
  Admin --> REVIEW[PATCH /api/admin/enrollment-requests/:id/review]
  REVIEW --> S5[transaction updates allocation, history and request status]
~~~

Frontend files: frontend/admin-dashboard.html and admin-dashboard-api.js; service logic: backend/src/services/admin.service.js. Admin account provisioning is CLI-only through backend/src/scripts/bootstrap-admin.js.

## 5. Teacher workflow

~~~mermaid
flowchart TD
  T[Teacher sign-in and /auth/me] --> DASH[Teacher dashboard API module]
  DASH --> CUR[Load active semester-subject mappings]
  CUR --> NEW[POST offering]
  NEW --> VALID[transaction checks active mapping and unique section]
  VALID --> OFFER[(offerings)]
  OFFER --> MAT[Upload material: multipart]
  OFFER --> ASSIGN[Create assignment]
  OFFER --> QUIZ[Save Google Forms metadata]
  OFFER --> ATT[Create session and mark eligible roster]
  ASSIGN --> REVIEW[Load submissions and grade]
~~~

Current pages/scripts: teacher-dashboard.html → teacher-dashboard-backend.js; course-detail.html → teacher-course-backend.js. Teacher ownership is checked inside the service for offering and child resources.

## 6. Student workflow

~~~mermaid
flowchart TD
  S[Student sign-in] --> G[auth-guard role and session check]
  G --> EN[View active enrollment options and request]
  EN --> ADMIN[Admin approves; current semester and history change atomically]
  ADMIN --> COURSES[GET /api/student/offerings]
  COURSES --> DETAIL[GET offering details if current semester eligible]
  DETAIL --> MATERIAL[Protected material download]
  DETAIL --> SUB[Submit assignment multipart files]
  SUB --> TEACHER[Teacher reviews and grades]
  TEACHER --> GRADE[Student sees grade/feedback]
  DETAIL --> QUIZ[Open external Google Form]
  DETAIL --> ATT[View held attendance records/summary]
~~~

Current pages/scripts: student_courses.html → student-courses-backend.js and student-enrollment.js; course_details.html → student-course-backend.js. Enrollment approval does not directly issue a new session; current eligibility is checked at API time.

## 7. File upload and protected download

~~~mermaid
sequenceDiagram
  participant UI as Teacher/Student page
  participant M as Multer + service
  participant DB as MySQL
  participant FS as Private storage
  UI->>M: multipart file(s)
  M->>M: size/count/extension filter
  M->>M: magic signature validation
  M->>FS: save using server-generated UUID key
  M->>DB: insert file_assets and association in transaction
  Note over UI,FS: File bytes are outside public frontend root
  UI->>DB: GET /api/files/:id
  DB->>DB: authorize owning Teacher or eligible Student; lock asset row
  DB-->>FS: read provider/key
  FS-->>UI: protected attachment stream
  Note over DB,FS: cleanup worker retries unreferenced files; shared refs retain the asset
~~~

## Important ownership semantics

- Offering ownership comes from offerings.teacher_profile_id and the authenticated Teacher profile.
- Student eligibility comes from active account, admitted/authorized profile, matching current semester and active offering/semester/subject.
- Assignment submission belongs to a Student profile and assignment, not to the Teacher who created it.
- Attendance belongs to session + Student; marker is an actor reference.
- File access is mediated by the file endpoint, not by public static URLs.
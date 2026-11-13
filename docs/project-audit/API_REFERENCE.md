# API reference

All routes are prefixed /api. Source of truth is backend/src/routes/*.routes.js, controllers and services. JSON success envelope is normally {success:true,data:...}; errors are {success:false,error,code}. Health endpoints have their own shape. CSRF is required for every unsafe method listed below. Request property names below are source-backed; optional fields may be omitted where the service supports partial updates.

## Public, auth and health

| Method + path | Purpose, auth, body/params | Controller/service and tables |
|---|---|---|
| GET /health | API health; public; no body. | health.routes.js; no DB. |
| GET /health/db | DB ping SELECT 1; public. | health.routes.js; connectivity only. |
| GET /auth/csrf | Issue CSRF cookie/token; public. | auth.controller.issueCsrf; no table. |
| POST /auth/:role/login | Public role login; role path admin/teacher/student; body email,password. | auth.controller.login → auth.service.login; users, role profile, user_sessions. |
| GET /auth/me | Authenticated current principal. | auth.controller.currentUser; requireAuth reads users, profiles, user_sessions. |
| POST /auth/logout | Authenticated cookie revocation; CSRF; empty body. | auth.controller.logout → auth.service.logout; user_sessions. |

Login errors include 400 malformed credentials, 401 INVALID_CREDENTIALS, 403 inactive/not-authorized/profile missing, and 404 unsupported role path. CSRF errors are 403.

## Admin (all require authenticated Admin)

| Method + path | Purpose and request shape | Service and principal tables |
|---|---|---|
| GET /admin/summary | Dashboard totals. | getDashboardSummary; student_profiles, teacher_profiles, semesters, curriculum_subjects. |
| GET /admin/students | List Student profiles/accounts. | listStudents; users, student_profiles, semesters. |
| POST /admin/students | Create Student; body displayName,email,password; role cannot be selected by caller. 201. | createStudent/createPerson; users, student_profiles, transaction. |
| GET /admin/students/:profileId | Student detail; UUID path. | getStudent; users, student_profiles, semesters. |
| DELETE /admin/students/:profileId | Permanently delete scoped Student data; explicit service workflow. | account-deletion.deleteStudent; user/profile, history, requests, submission/attendance/file refs, sessions/assets. |
| PATCH /admin/students/:profileId/admission | Body admissionStatus admitted or rejected. | updateStudentAdmission; student_profiles, user_sessions. |
| PATCH /admin/students/:profileId/authorization | Body authorizationStatus authorized or revoked; admission required to authorize. | updateStudentAuthorization; student_profiles, users, user_sessions. |
| POST /admin/students/:profileId/allocation | Body semesterId, optional reason; active eligible Student + active semester. | allocateStudent transaction; student_profiles, users, semesters, student_semester_history. |
| GET /admin/teachers | List Teacher accounts/profiles. | listTeachers; users, teacher_profiles. |
| POST /admin/teachers | Create Teacher; body displayName,email,password; role fixed by route. 201. | createTeacher/createPerson; users, teacher_profiles. |
| GET /admin/teachers/:profileId | Teacher profile detail. | getTeacher; users, teacher_profiles. |
| DELETE /admin/teachers/:profileId | Permanently delete Teacher-owned offerings/content and scoped files. | account-deletion.deleteTeacher; user/profile, offerings and all dependent coursework/attendance/file refs/sessions. |
| PATCH /admin/users/:userId | Update displayName and/or email. | updateUser; users. |
| PATCH /admin/users/:userId/status | Body accountStatus active/disabled/pending; last active Admin cannot be disabled; inactive status revokes sessions. | updateAccountStatus transaction/lock; users, user_sessions. |
| GET /admin/semesters | List semesters with subjectIds. | listSemesters; semesters, semester_subjects. |
| POST /admin/semesters | Body name,academicYear. 201. | createSemester; semesters. |
| PATCH /admin/semesters/:semesterId | Partial name,academicYear,status active/inactive. | updateSemester; semesters. |
| GET /admin/curriculum-subjects | List subjects with semesterIds. | listSubjects; curriculum_subjects, semester_subjects. |
| POST /admin/curriculum-subjects | Body code,name, optional description. 201. | createSubject; curriculum_subjects. |
| PATCH /admin/curriculum-subjects/:subjectId | Partial code,name,description,status. | updateSubject; curriculum_subjects. |
| POST /admin/semesters/:semesterId/subjects/:subjectId | Create active mapping; 201. | mapSubject; lock semester/subject, insert semester_subjects. |
| DELETE /admin/semesters/:semesterId/subjects/:subjectId | Remove mapping; does not delete masters or offerings. Offerings reference semester and subject directly; the live schema has no offering-to-mapping FK, so those offerings do not block deleting this mapping row. | unmapSubject; semester_subjects. |
| GET /admin/enrollment-requests | List request/student/semester summary. | listEnrollmentRequests; requests, profiles, users, semesters. |
| PATCH /admin/enrollment-requests/:requestId/review | Body decision approved/rejected, optional reviewNote. Approval allocates and appends history in one transaction. | reviewEnrollmentRequest; request/profile/user/semester/history. |

## Student enrollment (all require authenticated Student)

| Method + path | Purpose and request shape | Service/tables |
|---|---|---|
| GET /student/enrollment-options | Active semester options. | student.controller; semesters. |
| GET /student/enrollment-requests | Own request history. | student.controller; requests, semesters. |
| POST /student/enrollment-requests | Body semesterId; at most one pending request per Student; 201. | createEnrollmentRequest transaction; profile/user/semester/requests. |
| POST /student/enrollment-requests/:requestId/withdraw | Withdraw own pending request only. | withdrawEnrollmentRequest transaction; profile, request. |

## Teacher academic workflows (all require authenticated Teacher)

| Method + path | Request | Service and tables |
|---|---|---|
| GET /teacher/curriculum-subjects | Active mapped semester-subject choices. | getTeacherCurriculum; mappings, semesters, subjects. |
| GET /teacher/offerings | Own offerings. | listTeacherOfferings; offerings, subject, semester, profile/users. |
| POST /teacher/offerings | Body curriculumSubjectId,semesterId,optional sectionCode,description; active mapping required; 201. | createOffering transaction; offerings/mapping/master records. |
| GET /teacher/offerings/:offeringId | Own offering, materials, assignments/submission counts, quiz links, attendance sessions/eligible count. | getTeacherOffering; offering child tables. |
| PATCH /teacher/offerings/:offeringId | Partial sectionCode,description,status. | updateOffering; owner lock, offerings. |
| DELETE /teacher/offerings/:offeringId | Delete only own offering and dependent data; 503 if physical cleanup remains pending. | deleteOffering + cleanup worker; offering dependencies, file refs/assets/jobs. |
| POST /teacher/offerings/:offeringId/materials | Multipart files (one max), plus title,materialType,description,optional externalUrl. 201. | createMaterial; materials/file_assets/offerings. |
| PATCH /teacher/materials/:materialId | Update material title/type/description/externalUrl. | updateMaterial; materials/offerings. |
| DELETE /teacher/materials/:materialId | Delete owned material; clean unreferenced file. | deleteMaterial; materials/assets/jobs. |
| POST /teacher/offerings/:offeringId/assignments | Body title,description,startAt,dueAt,maximumMarks or marks,status draft/published. 201. | createAssignment; assignments/offerings. |
| PATCH /teacher/assignments/:assignmentId | Partial title,description,startAt,dueAt,marks,status; maximum cannot fall below existing grades. | updateAssignment; assignment/submissions. |
| DELETE /teacher/assignments/:assignmentId | Delete owned assignment, submissions and their file references. | deleteAssignment; assignment/submissions/files/assets/jobs. |
| GET /teacher/assignments/:assignmentId/submissions | Submitted work only; drafts hidden. | listSubmissions; assignments/offerings/submissions/files/assets. |
| PATCH /teacher/submissions/:submissionId/grade | Body grade,optional feedback; grade nonnegative, max two decimals, not above assignment marks. | gradeSubmission transaction; submissions/assignments/offerings/users. |
| POST /teacher/offerings/:offeringId/quizzes | Body title,description,googleFormUrl,durationMinutes,startAt,dueAt,status; Google Forms HTTPS URL only. 201. | createQuiz; quizzes/offerings. |
| PATCH /teacher/quizzes/:quizId | Partial quiz metadata/status. | updateQuiz; quiz/owner offering. |
| DELETE /teacher/quizzes/:quizId | Delete quiz metadata only. | deleteQuiz; quizzes/offerings. |
| GET /teacher/offerings/:offeringId/attendance-sessions | Own offering session list. | createAttendanceSessionList; sessions/offerings. |
| POST /teacher/offerings/:offeringId/attendance-sessions | Body title,startsAt,optional endsAt,status; 201. | createAttendanceSession; sessions/offerings. |
| GET /teacher/offerings/:offeringId/eligible-students | Currently eligible Students. | listCurrentSemesterEligibleStudents; profiles/users/offerings. |
| GET /teacher/attendance-sessions/:sessionId/roster | Session and currently eligible roster with existing marks. | attendanceRoster; session/offering/profile/user/records. |
| PUT /teacher/attendance-sessions/:sessionId/records/:studentProfileId | Body attendanceStatus present/absent/late/excused, optional note; inserts or corrects unique session/Student record. | markAttendance transaction; session/offering/profile/user/records. |

## Student academic access

| Method + path | Purpose and request | Service/tables |
|---|---|---|
| GET /student/offerings | Currently eligible active offerings. | getStudentOfferings; profiles/users/offerings/masters. |
| GET /student/offerings/:offeringId | Offering details, materials, published assignments/quiz metadata, own submission/grade/feedback, attendance. | getStudentOffering; offering children and Student-owned rows. |
| GET /student/offerings/:offeringId/assignments/:assignmentId/submission | Own submission state/details. | ownSubmission; offering/assignment/submission/files. |
| POST /student/offerings/:offeringId/assignments/:assignmentId/submission | Multipart status draft/submitted and up to five files, each <=10 MB; within published assignment window. | submitAssignment transaction; eligibility, assignment, submission, file metadata/association. |
| GET /student/offerings/:offeringId/attendance | Own held-session attendance summary. | getStudentAttendance; offering/session/records. |

## Protected files

| Method + path | Purpose and access |
|---|---|
| GET /files/:fileId | Authenticated Teacher or Student only. Teacher must own offering; Student must be eligible for offering/material or submission context. Streams with attachment headers and no-store cache. |

## Shared behavior and errors

Most JSON endpoints return {success:true,data:<value>}. Not-found/error middleware returns {success:false,error,code}. Common codes: VALIDATION_ERROR (400), AUTH_REQUIRED/SESSION_INVALID (401), FORBIDDEN/CSRF_REJECTED (403), domain not-found (404), duplicate/state/eligibility conflicts (409), upload size limit (413), cleanup pending (503), DB unavailable (503 where recognized), otherwise safe 500 INTERNAL_ERROR. Exact service errors may vary by endpoint.

Use frontend/api-client.js rather than hand-built fetch calls so cookies, CSRF and response parsing remain consistent. Avoid relying on this inventory for undocumented query parameters: route files expose no query-parameter API for these features.
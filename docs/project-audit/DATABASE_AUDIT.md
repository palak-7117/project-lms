# Database audit

## Evidence

On 2026-11-13, read-only SELECTs from information_schema verified 19 base tables; each is InnoDB and utf8mb4_0900_ai_ci. Column definitions, PK/unique/index metadata, FKs/delete rules and CHECK clauses were queried. No credentials or row-level personal data were recorded. No SQL was executed.

## Table-by-table inventory

| Table | Purpose and important columns | Key relationships / constraints |
|---|---|---|
| users | Identity: id CHAR(36), email, password_hash, display_name, role, account_status, timestamps. | PK id; unique email; referenced by profiles, sessions, uploaders and actor/reviewer fields. |
| student_profiles | Admission/authorization statuses and current_semester_id. | PK id; unique user_id; user CASCADE; semester RESTRICT. |
| teacher_profiles | Teacher id/user_id and timestamps. | PK id; unique user_id; user CASCADE. |
| semesters | name, academic_year, status, timestamps. | PK id; unique (name, academic_year); referenced by mappings, allocation, requests, offerings, history. |
| curriculum_subjects | Official code/name/description/status. | PK id; unique code; referenced through semester_subjects and offerings. |
| semester_subjects | Official semester-to-subject mapping. | Composite PK (semester_id,curriculum_subject_id); both FKs RESTRICT. |
| student_semester_history | from/to semester, student, actor, reason, changed_at. | BIGINT unsigned PK; Student CASCADE; semesters RESTRICT; actor SET NULL. |
| student_enrollment_requests | Student, semester, status, requested/review times, reviewer, note. | PK id; Student CASCADE; semester RESTRICT; reviewer SET NULL. |
| offerings | Teacher, subject, semester snapshot, section_code, description/status. | PK id; unique (teacher,subject,semester,section); FKs to all three RESTRICT. |
| materials | Offering, optional asset, title/type/description/external_url. | PK id; offering CASCADE; file asset RESTRICT. |
| assignments | Offering, title/description, start/due, marks, status. | PK id; offering CASCADE. |
| assignment_submissions | Student/assignment status, submitted time, grade/feedback/grader/time. | PK id; unique (assignment,student); assignment/Student CASCADE; grader SET NULL. |
| submission_files | Submission and asset association. | PK id; unique (submission,file); submission CASCADE; asset RESTRICT. |
| quizzes | Offering, Google Forms URL, title, duration, schedule/status. | PK id; offering CASCADE; metadata only, no quiz question/attempt/result tables. |
| attendance_sessions | Offering, title, start/end, status. | PK id; offering CASCADE. |
| attendance_records | Session/Student attendance status, marker, note, times. | PK id; unique (session,student); session/Student CASCADE; marker SET NULL. |
| file_assets | Provider/key, original filename/content type/size/hash/uploader/status. | PK id; unique (provider,key); uploader SET NULL. |
| file_cleanup_jobs | Asset/key/provider, status, retries, schedule, error/completion. | BIGINT unsigned PK; unique asset and (provider,key); asset SET NULL. |
| user_sessions | user id, token_hash, expiry, last_seen, revoked. | PK id; unique token_hash; user CASCADE. |

All IDs are CHAR(36) UUIDs except the BIGINT unsigned history and cleanup job IDs.

## Foreign-key actions

CASCADE: users→student_profiles, teacher_profiles, user_sessions; student_profiles→history, enrollment requests, submissions, attendance records; offerings→materials, assignments, quizzes, attendance sessions; assignments→submissions; attendance sessions→attendance records; submissions→submission_files.

RESTRICT: semester/subject masters→mapping and offerings; semesters→current allocation/history/enrollment requests; Teacher profiles→offerings; file_assets→materials/submission_files. Services must remove dependent refs before asset/owner deletion.

SET NULL: users→submission graders, attendance markers, uploaders, request reviewers, history actors; file_assets→cleanup jobs.

Every FK has ON UPDATE NO ACTION.

## Important unique keys and indexes

Unique: users.email; student_profiles.user_id; teacher_profiles.user_id; semesters(name,academic_year); curriculum_subjects.code; semester_subjects(semester,subject); offerings(teacher,subject,semester,section); assignment_submissions(assignment,student); attendance_records(session,student); submission_files(submission,file); file_assets(provider,key); file_cleanup_jobs.file_asset_id and (provider,key); user_sessions.token_hash.

Secondary indexes cover role/status filtering, eligibility, owner/reference FKs, due/schedule timestamps, enrollment status and cleanup queue. Exact index names/column order should be re-read from information_schema.statistics when designing migrations.

## CHECK clauses observed

Assignments: start_at < due_at; optional marks > 0. Submissions: draft iff submitted_at null; grades nonnegative; graded iff grade and graded_at present. Attendance end > start when present. Files nonzero. Cleanup job completed state pairs completed_at and null key. Quiz start < due and duration 1..600. Enrollment approved/rejected requires reviewed_at; pending/withdrawn requires null reviewed_at. History requires at least one from/to semester. Sessions expire after creation.

CHECKs cannot validate cross-table grade <= assignment.marks. Service does this while locking the submission/assignment. Enrollment CHECK does not require reviewer id to be non-null when reviewed_at exists; the approval service writes both fields. The database cannot express every business invariant with its current constraints.

## Relationships explained

users to student_profiles and teacher_profiles is one-to-zero-or-one (unique profile.user_id). Admin users have no role profile. Semester and curriculum subjects are many-to-many through semester_subjects. Offerings independently store teacher, subject and semester; service creation checks that the selected pair is actively mapped. The semester_id retained on an offering is the offering's original term; Student eligibility matches current_semester_id to that snapshot.

An offering owns many materials, assignments, quizzes and attendance sessions. Assignment submissions are one per Student per assignment. An attendance session has many Student records and the unique pair prevents duplicates. File associations are shared-reference relationships; a file is physically deleted only after the service confirms no material/submission association remains. A user may have multiple sessions.

~~~mermaid
erDiagram
 USERS ||--o| STUDENT_PROFILES : profile
 USERS ||--o| TEACHER_PROFILES : profile
 SEMESTERS ||--o{ SEMESTER_SUBJECTS : maps
 CURRICULUM_SUBJECTS ||--o{ SEMESTER_SUBJECTS : maps
 TEACHER_PROFILES ||--o{ OFFERINGS : owns
 SEMESTERS ||--o{ OFFERINGS : snapshot
 CURRICULUM_SUBJECTS ||--o{ OFFERINGS : subject
 OFFERINGS ||--o{ MATERIALS : has
 OFFERINGS ||--o{ ASSIGNMENTS : has
 ASSIGNMENTS ||--o{ ASSIGNMENT_SUBMISSIONS : receives
 STUDENT_PROFILES ||--o{ ASSIGNMENT_SUBMISSIONS : submits
 ASSIGNMENT_SUBMISSIONS ||--o{ SUBMISSION_FILES : attaches
 FILE_ASSETS ||--o{ SUBMISSION_FILES : referenced
 OFFERINGS ||--o{ QUIZZES : links
 OFFERINGS ||--o{ ATTENDANCE_SESSIONS : schedules
 ATTENDANCE_SESSIONS ||--o{ ATTENDANCE_RECORDS : records
 STUDENT_PROFILES ||--o{ ATTENDANCE_RECORDS : attends
 USERS ||--o{ USER_SESSIONS : signs_in
~~~

## Why keys and transactions matter

PKs identify rows; FKs prevent orphan rows; unique keys enforce identities/one-per rules; indexes speed lookup; CHECKs validate row-local rules. Transactions make multi-row changes all-or-nothing. Allocation plus history and enrollment approval plus allocation/history must commit together. Controlled account deletions remove role-scoped relationships before queuing file deletion.

## Migration caveats

There is no checked-in DDL snapshot in the repository; do not assume README or test fixture is a deployable schema. Capture and review versioned DDL before new environment setup. Existing localStorage records are not imported. If a future migration is approved, resolve duplicate IDs/emails, legacy relationship variants, stale browser state, data shape differences, time zones and localStorage file/base64 content before writing any import.
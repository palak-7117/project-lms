# LearnSpace

LearnSpace is a web-based learning management system with separate experiences for Admins, Teachers, and Students. It provides account management, academic records, course offerings, learning materials, assignments, attendance, and grades.

## Features

### Admin

- Sign in using an Admin account.
- Create and manage Student and Teacher accounts.
- Manage semesters and curriculum subjects.
- Map subjects to semesters.
- Set Student admission and authorization status.
- Allocate Students to semesters.
- Review Student enrollment requests.

### Teacher

- Create and manage course offerings based on the available curriculum.
- Add course materials and files.
- Create and manage assignments.
- Review submissions and record grades and feedback.
- Create and manage attendance sessions.
- Record Student attendance.
- Save Google Forms links and related metadata.

### Student

- View eligible course offerings.
- Request enrollment and view enrollment request status.
- Access course materials.
- Create and submit assignment work.
- View grades, feedback, and attendance information.

### Authentication and access control

- Role-based sign-in for Admins, Teachers, and Students.
- Server-side session handling.
- Role and ownership checks for protected API operations.
- CSRF checks for requests that change data.
- Protected access to uploaded files.

## Technology

- **Frontend:** Static HTML, CSS, and JavaScript.
- **Backend:** Node.js and Express.
- **Database:** MySQL.
- **Database management:** MySQL Workbench can be used to connect to and manage the MySQL Server.
- **File handling:** Files are stored using the configured backend storage provider.

The local MySQL database contains **19 tables**.

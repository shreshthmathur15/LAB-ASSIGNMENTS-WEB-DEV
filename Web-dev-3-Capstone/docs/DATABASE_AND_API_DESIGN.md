# Database Design, Architecture & REST API Documentation

**Project:** University Campus Management System  
**Submitted By:** Harshwardhan | **Roll Number:** `2501730330` | **Semester:** 3  
**University:** K.R. Mangalam University  

---

## 1. System Architecture & Request Execution Flow

The application follows a modular **MVC + Event-Driven Layered Architecture**:

```text
Client (REST / Socket.IO)
        │
        ▼
  Express Router (src/routes/*.routes.js)
        │
        ▼
  Middleware Chain:
   1. helmet / cors / express.json / cookieParser
   2. httpMorganLogger & requestAuditLogger
   3. authenticate (JWT access token verification -> attaches req.user)
   4. authorize(...roles) (RBAC check -> 403 if insufficient role)
   5. validate (express-validator rules -> 400 on field errors)
        │
        ▼
  Controller (src/controllers/*.controller.js via asyncHandler)
        │
        ├──► Mongoose Models (src/models/*.js) ──► MongoDB (krmu_campus_db)
        │
        └──► AppEmitter (src/events/appEvents.js) ──► Socket.IO Rooms (src/sockets/socketManager.js)
        │
        ▼
  ApiResponse (Standardized JSON) / errorHandler (Centralized Error Middleware)
```

---

## 2. Database Design (MongoDB Collections & Mongoose Schemas)

### Collections Overview
1. **`users`**: Stores administrators, faculty members, and students (`role: 'admin' | 'faculty' | 'student'`). Passwords are hashed via `bcryptjs` (`pre('save')` hook with 10 salt rounds). Refresh tokens are stored as SHA-256 digests (`select: false`).
2. **`courses`**: Academic courses with uppercase unique `code` (e.g., `CSEN2001`), `title`, `credits`, `department`, and `semester`.
3. **`sections`**: Specific class offerings linking a `Course` (`ref: 'Course'`) and assigned `Faculty` (`ref: 'User'`), with capacity and schedule metadata.
4. **`enrollments`**: Junction collection linking `student` (`ref: 'User'`), `course` (`ref: 'Course'`), and `section` (`ref: 'Section'`).
5. **`attendances`**: Individual session attendance records (`Present`, `Absent`, `Late`, `Excused`) with date normalization to UTC midnight and an embedded `auditLog` array tracking all corrections (`previousStatus`, `newStatus`, `changedBy`, `reason`, `changedAt`).
6. **`announcements`**: Campus-wide, course-specific, or section-specific notices with `priority` and `isPinned`.

### Database Indexes & Purpose

| Collection | Index Definition | Type | Purpose / Business Rule Enforced |
| :--- | :--- | :--- | :--- |
| `users` | `{ role: 1, department: 1, semester: 1 }` | Compound | Accelerates admin user directory filters by role/department/semester |
| `courses` | `{ department: 1, semester: 1 }` & `{ title: 'text', code: 'text' }` | Compound + Text | Fast semester filtering & keyword course search |
| `sections` | `{ name: 1, course: 1, academicYear: 1 }` | **Unique Compound** | Prevents duplicate section names (e.g., two `Section A`s) for the same course/year |
| `enrollments` | `{ student: 1, course: 1 }` | **Unique Compound** | Prevents duplicate enrollment of the same student in the same course (`409 Conflict`) |
| `attendances` | `{ student: 1, course: 1, section: 1, date: 1, sessionNumber: 1 }` | **Unique Compound** | Prevents duplicate attendance marking for the same student and class session |
| `announcements` | `{ targetScope: 1, course: 1, section: 1, createdAt: -1 }` | Compound | Fast feed retrieval for scoped announcements newest-first |

---

## 3. MongoDB Aggregation Pipelines Implemented

1. **Subject-Wise & Student-Wise Attendance Summary (`GET /api/reports/attendance-summary`):**
   Uses `$match` -> `$group` (summing `Present`, `Late`, `Absent`, `Excused`, and attended count) -> `$lookup` (`users`, `courses`, `sections`) -> `$unwind` -> `$addFields` (computing `attendancePercentage` rounded to 2 decimals) -> `$project` -> `$sort`.
2. **Low-Attendance Defaulters Report (`GET /api/reports/low-attendance?threshold=75`):**
   Aggregates attendance per `(student, course, section)`, calculates `attendancePercentage`, applies `$match: { attendancePercentage: { $lt: threshold } }`, joins student/course details via `$lookup`, and computes `deficitPercentage`.
3. **Multi-Facet Enrollment & Capacity Utilization (`GET /api/reports/enrollment-stats`):**
   Uses `$lookup` with correlated sub-pipeline (`let: { sectionId: '$_id' }`) on active enrollments and `$facet` to return `sectionWise`, `courseWise`, and `departmentSummary` analytics in a single database query.

---

## 4. Complete REST API Reference

### A. System & Authentication
| Method | Endpoint | Auth / Role | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | Returns Node `process` uptime, memory usage, and MongoDB connection state |
| `POST` | `/api/auth/register` | Public | Self-registers a `student` account (blocks `admin`/`faculty` self-escalation with `403`) |
| `POST` | `/api/auth/login` | Public | Verifies bcrypt password, issues JWT `accessToken` + `refreshToken` |
| `POST` | `/api/auth/refresh` | Public (Refresh Token) | Validates refresh token and rotates both access and refresh tokens |
| `POST` | `/api/auth/logout` | Authenticated | Revokes stored refresh token in MongoDB and clears cookies |

### B. Users & Profiles
| Method | Endpoint | Auth / Role | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/users/me` | Authenticated | View current user's profile |
| `PATCH` | `/api/users/me` | Authenticated | Update allowed fields (`name`, `phone`, `department`) |
| `GET` | `/api/users` | `admin` | Paginated, filtered list of users (`role`, `department`, `semester`, `search`) |
| `POST` | `/api/users` | `admin` | Provision new `admin`, `faculty`, or `student` account |
| `GET` / `PATCH` / `DELETE` | `/api/users/:id` | `admin` | View, update, or delete user by ID |

### C. Courses, Sections & Enrollments
| Method | Endpoint | Auth / Role | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/courses` & `/api/courses/:id` | Authenticated | List (with filters/pagination) or retrieve course |
| `POST` / `PATCH` / `DELETE` | `/api/courses` / `/api/courses/:id` | `admin` | Create, update, or delete courses |
| `GET` | `/api/sections` & `/api/sections/:id` | Authenticated | List or view sections with populated course and faculty |
| `POST` / `PATCH` / `DELETE` | `/api/sections` / `/api/sections/:id` | `admin` | Create section & assign faculty (validates `role === 'faculty'`) |
| `POST` | `/api/enrollments` | `admin` | Enroll student in course/section (prevents duplicates -> `409`, enforces capacity) |
| `GET` | `/api/enrollments/my-courses` | Authenticated | Enrolled courses (student) or assigned sections (faculty) |
| `GET` / `DELETE` | `/api/enrollments` / `/api/enrollments/:id` | `admin`, `faculty` (GET) / `admin` (DELETE) | Manage enrollments |

### D. Attendance Management
| Method | Endpoint | Auth / Role | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/attendance/mark` | `faculty`, `admin` | Bulk/single attendance mark; verifies faculty section ownership (`403`) and enrollment (`400`), blocks duplicate sessions (`409`) |
| `PATCH` | `/api/attendance/:id` | `faculty`, `admin` | Corrects status and records immutable entry in `auditLog` |
| `GET` | `/api/attendance/my` | `student` | Student's attendance logs + aggregated subject-wise percentages |
| `GET` | `/api/attendance/student/:studentId` | `student` (self), `faculty`, `admin` | View student attendance (`403` if student queries another student) |
| `GET` | `/api/attendance/section/:sectionId` | `faculty`, `admin` | View section attendance filtered by date/session |

### E. Announcements & Reports
| Method | Endpoint | Auth / Role | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/announcements` | `admin`, `faculty` | Publish notice (`faculty` restricted to assigned courses/sections) and broadcast via Socket.IO |
| `GET` | `/api/announcements` | Authenticated | Fetch scoped announcements relevant to the current user |
| `GET` | `/api/reports/attendance-summary` | `admin`, `faculty` | Aggregation Pipeline 1: Subject/student attendance summary |
| `GET` | `/api/reports/low-attendance` | `admin`, `faculty` | Aggregation Pipeline 2: Defaulters below configurable `threshold` |
| `GET` | `/api/reports/enrollment-stats` | `admin`, `faculty` | Aggregation Pipeline 3: Multi-facet section/course/department stats |
| `GET` | `/api/reports/attendance-summary/export` | `admin`, `faculty` | Downloadable CSV attendance report |
| `GET` | `/api/events/history` | `admin` | Inspect recent internal `EventEmitter` logs |

---

## 5. Sample Error Response Format

All operational, validation, authentication, and database errors return a unified JSON structure:

```json
{
  "success": false,
  "statusCode": 403,
  "message": "Forbidden: You are not assigned to mark attendance for this section.",
  "errors": []
}
```

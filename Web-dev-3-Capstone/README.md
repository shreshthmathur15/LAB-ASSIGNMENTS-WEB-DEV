# University Campus Management System — Backend Development Capstone

**Student:** Harshwardhan  
**Roll Number:** `2501730330`  
**Semester:** 3  
**Institution:** K.R. Mangalam University  
**Tech Stack:** Node.js, Express.js, MongoDB, Mongoose, JWT, bcryptjs, Socket.IO, EventEmitter  

---

## 1. Project Overview

The **KRMU University Campus Management System** is a production-structured RESTful and real-time backend application designed for academic operations at **K.R. Mangalam University**. It enforces strict Role-Based Access Control (RBAC) across **Administrators**, **Faculty Members**, and **Students**, manages courses, sections, and student enrollments, tracks attendance with an immutable correction audit trail, computes academic analytics via MongoDB aggregation pipelines, and pushes live notifications via Node.js `EventEmitter` and **Socket.IO**.

---

## 2. Syllabus Concepts Demonstrated

| Syllabus Unit | Implementation in This Project |
| :--- | :--- |
| **Unit 1 – Node.js Fundamentals** | Modular CommonJS architecture, `npm` scripts, Node core modules (`http`, `crypto`, `events`), `process` runtime telemetry (`GET /api/health`), CLI seed runner, and Node test runner (`node --test`). |
| **Unit 2 – Express.js & MVC** | Layered MVC + Event architecture (`routes/`, `controllers/`, `models/`, `middleware/`, `events/`, `sockets/`), RESTful status codes, middleware chaining (`helmet`, `cors`, `morgan`, `requestAuditLogger`, `authenticate`, `authorize`, `validate`), and centralized error handling. |
| **Unit 3 – MongoDB & Mongoose** | 6 relational Mongoose schemas (`User`, `Course`, `Section`, `Enrollment`, `Attendance`, `Announcement`), strict field validation, **unique compound & text indexes**, and **3 multi-stage Aggregation Pipelines** (`$match`, `$group`, `$lookup`, `$unwind`, `$addFields`, `$facet`). |
| **Unit 4 – Security & Real-Time** | `dotenv` configuration, `bcryptjs` password hashing, JWT access + rotating SHA-256-hashed refresh tokens, RBAC route protection, custom `AppEmitter` (`EventEmitter`), and authenticated room-based **Socket.IO** notifications. |

---

## 3. Prerequisites & Installation

1. **Node.js** `>= 20.0.0` (tested on `v24.14.0`) and **npm**
2. **MongoDB** running locally on `mongodb://127.0.0.1:27017`

### Setup Steps

```bash
# 1. Navigate to project directory
cd /Users/harshwardhan/.gemini/antigravity/scratch/krmu-campus-management-system

# 2. Install dependencies
npm install

# 3. Configure environment variables (copy example if .env is not present)
cp .env.example .env

# 4. Seed K.R. Mangalam University sample data
npm run seed

# 5. Start the server (or npm run dev for watch mode)
npm start
```

> **Security Note:** `.env` is explicitly excluded in `.gitignore` and is never committed to Git.

---

## 4. Environment Variables (`.env`)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `NODE_ENV` | Runtime mode (`development`, `production`, `test`) | `development` |
| `PORT` | HTTP & Socket.IO server port | `5000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/krmu_campus_db` |
| `JWT_ACCESS_SECRET` | Secret key for signing short-lived access tokens | *(configured in `.env`)* |
| `JWT_REFRESH_SECRET` | Secret key for signing refresh tokens | *(configured in `.env`)* |
| `JWT_ACCESS_EXPIRES_IN` | Access token lifetime | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token lifetime | `7d` |
| `LOW_ATTENDANCE_THRESHOLD` | Minimum attendance % threshold for defaulter alerts | `75` |
| `CORS_ORIGIN` | Allowed CORS origin | `*` |

---

## 5. Seeded Accounts & Sample Data (`npm run seed`)

Running `npm run seed` populates `krmu_campus_db` with 6 users, 3 Semester-3 courses (`CSEN2001`, `CSEN2002`, `CSEN2003`), 3 sections, active enrollments, multi-day attendance logs (including an audited correction), and scoped announcements.

All seeded accounts use password: **`Password@123`**

| Role | Name | Email | Identifier / Details |
| :--- | :--- | :--- | :--- |
| **Admin** | Dr. Rajesh Kumar | `admin@krmangalam.edu.in` | `KRMU-ADM-001` |
| **Faculty 1** | Prof. Ananya Sharma | `ananya.sharma@krmangalam.edu.in` | `KRMU-FAC-101` (Teaches CSEN2001 & CSEN2002 Sec A) |
| **Faculty 2** | Dr. Vikram Mehta | `vikram.mehta@krmangalam.edu.in` | `KRMU-FAC-102` (Teaches CSEN2003 Sec B) |
| **Student 1** | **Harshwardhan** | `harshwardhan@krmangalam.edu.in` | **Roll No: `2501730330`**, Sem 3 (>85% attendance) |
| **Student 2** | Aarav Verma | `aarav.verma@krmangalam.edu.in` | Roll No: `2501730331`, Sem 3 (<75% attendance defaulter) |
| **Student 3** | Priya Nair | `priya.nair@krmangalam.edu.in` | Roll No: `2501730332`, Sem 3 |

---

## 6. Running Automated Tests & Postman Collection

### Automated Integration + Real-Time Test Suite
```bash
npm test
```
Runs 12 automated integration and Socket.IO tests (`tests/api.test.js`) against `krmu_campus_test_db`, validating auth, refresh token rotation, RBAC, duplicate prevention (`409`), faculty section ownership, student attendance privacy (`403`), aggregation pipelines, CSV export, and real-time Socket.IO event delivery.

### Postman Collection
Import `postman/KRMU_Campus_Management_Postman_Collection.json` into Postman. Run the `02. Authentication & Tokens` login requests first to automatically populate `adminToken`, `facultyToken`, and `studentToken` collection variables.

---

## 7. Real-Time Architecture (`EventEmitter` + `Socket.IO`)

1. **Internal Event Bus (`src/events/appEvents.js`):** Controllers stay completely decoupled from WebSocket transport by emitting domain events (`announcement:published`, `attendance:marked`, `attendance:corrected`, `enrollment:created`) on the singleton `appEmitter`.
2. **Authenticated WebSockets (`src/sockets/socketManager.js`):** Every Socket.IO connection passes through `io.use(...)` JWT verification (`socket.handshake.auth.token`) and automatically joins authorized rooms:
   - `university` (all authenticated campus users)
   - `user:<userId>` (personal attendance updates & `<75%` low-attendance alerts)
   - `course:<courseId>` and `section:<sectionId>` (based on active enrollments/assignments)
3. **Real-Time Events Emitted:**
   - `announcement:new` -> broadcast to `university`, `course:<id>`, or `section:<id>`
   - `attendance:updated` -> emitted to `user:<studentId>` whenever attendance is marked or corrected
   - `attendance:low_alert` -> emitted to `user:<studentId>` when subject percentage drops below `LOW_ATTENDANCE_THRESHOLD`

---

## 8. Documentation Index

- Detailed Database Schemas, Indexes, Aggregation Pipelines, REST API Docs, and Request Execution Flow: [`docs/DATABASE_AND_API_DESIGN.md`](docs/DATABASE_AND_API_DESIGN.md)
- Postman Collection: [`postman/KRMU_Campus_Management_Postman_Collection.json`](postman/KRMU_Campus_Management_Postman_Collection.json)

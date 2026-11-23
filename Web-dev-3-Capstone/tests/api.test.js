const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { io: ioClient } = require('socket.io-client');

process.env.NODE_ENV = 'test';
require('dotenv').config();

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/krmu_campus_test_db';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_access_secret_key';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test_refresh_secret_key';
process.env.LOW_ATTENDANCE_THRESHOLD = '75';

const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');
const { initializeSocketServer } = require('../src/sockets/socketManager');
const { seedDatabase } = require('../src/seed/seed');
const User = require('../src/models/User');
const Course = require('../src/models/Course');
const Section = require('../src/models/Section');

let httpServer;
let ioServer;
let baseUrl;

// Helper for making HTTP JSON requests using native fetch
const apiRequest = async (path, { method = 'GET', token = null, body = null } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== null) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();
  return { status: res.status, headers: res.headers, data };
};

describe('KRMU University Campus Management System — Integration & Real-Time Tests', () => {
  let adminToken;
  let faculty1Token;
  let harshToken;
  let aaravToken;

  let harshUser;
  let aaravUser;
  let faculty1User;
  let course2001;
  let section2001A;
  let section2003B;
  let newStudentId;
  let createdAttendanceId;

  before(async () => {
    await connectDB(TEST_DB_URI);
    await seedDatabase();

    httpServer = http.createServer(app);
    ioServer = initializeSocketServer(httpServer);

    await new Promise((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // Fetch seeded entity references
    [harshUser, aaravUser, faculty1User, course2001] = await Promise.all([
      User.findOne({ email: 'harshwardhan@krmangalam.edu.in' }),
      User.findOne({ email: 'aarav.verma@krmangalam.edu.in' }),
      User.findOne({ email: 'ananya.sharma@krmangalam.edu.in' }),
      Course.findOne({ code: 'CSEN2001' }),
    ]);

    const sections = await Section.find().populate('course');
    section2001A = sections.find((s) => s.course.code === 'CSEN2001');
    section2003B = sections.find((s) => s.course.code === 'CSEN2003');

    // Login core actors
    const loginActor = async (email) => {
      const res = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: { email, password: 'Password@123' },
      });
      assert.equal(res.status, 200);
      return res.data.data.accessToken;
    };

    [adminToken, faculty1Token, harshToken, aaravToken] = await Promise.all([
      loginActor('admin@krmangalam.edu.in'),
      loginActor('ananya.sharma@krmangalam.edu.in'),
      loginActor('harshwardhan@krmangalam.edu.in'),
      loginActor('aarav.verma@krmangalam.edu.in'),
    ]);
  });

  after(async () => {
    if (ioServer) {
      await new Promise((resolve) => ioServer.close(resolve));
    }
    if (httpServer && httpServer.listening) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    await disconnectDB();
  });

  describe('1. Health & Node Process Telemetry', () => {
    it('GET /api/health returns healthy server and connected MongoDB state', async () => {
      const res = await apiRequest('/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert.equal(res.data.data.database.state, 'connected');
      assert.ok(res.data.data.nodeVersion.startsWith('v'));
    });
  });

  describe('2. Authentication, JWT Refresh Rotation & Validation', () => {
    it('POST /api/auth/register creates a student account and blocks role escalation', async () => {
      // Blocked admin role escalation
      const escalated = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: {
          name: 'Rogue User',
          email: 'rogue@krmangalam.edu.in',
          password: 'Password@123',
          role: 'admin',
        },
      });
      assert.equal(escalated.status, 403);

      // Invalid payload -> 400 validation error
      const invalid = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: { name: 'A', email: 'not-an-email', password: '123' },
      });
      assert.equal(invalid.status, 400);
      assert.ok(Array.isArray(invalid.data.errors));
      assert.ok(invalid.data.errors.length >= 2);

      // Valid student registration -> 201
      const valid = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: {
          name: 'Riya Kapoor',
          email: 'riya.kapoor@krmangalam.edu.in',
          password: 'Password@123',
          rollNumber: '2501730399',
          department: 'Computer Science & Engineering',
          semester: 3,
        },
      });
      assert.equal(valid.status, 201);
      assert.equal(valid.data.data.user.role, 'student');
      assert.equal(valid.data.data.user.password, undefined);
      assert.ok(valid.data.data.accessToken);
      assert.ok(valid.data.data.refreshToken);
      newStudentId = valid.data.data.user._id;
    });

    it('POST /api/auth/login rejects wrong password and rotates refresh tokens', async () => {
      const badLogin = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: { email: 'harshwardhan@krmangalam.edu.in', password: 'WrongPassword' },
      });
      assert.equal(badLogin.status, 401);

      const login = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: { email: 'riya.kapoor@krmangalam.edu.in', password: 'Password@123' },
      });
      assert.equal(login.status, 200);
      const oldRefresh = login.data.data.refreshToken;
      const tempAccess = login.data.data.accessToken;

      const refreshed = await apiRequest('/api/auth/refresh', {
        method: 'POST',
        body: { refreshToken: oldRefresh },
      });
      assert.equal(refreshed.status, 200);
      assert.ok(refreshed.data.data.accessToken);
      assert.ok(refreshed.data.data.refreshToken);
      assert.notEqual(refreshed.data.data.refreshToken, oldRefresh);

      // Reusing already-rotated refresh token must fail
      const reusedOldRefresh = await apiRequest('/api/auth/refresh', {
        method: 'POST',
        body: { refreshToken: oldRefresh },
      });
      assert.equal(reusedOldRefresh.status, 401);

      const logoutRes = await apiRequest('/api/auth/logout', {
        method: 'POST',
        token: tempAccess,
      });
      assert.equal(logoutRes.status, 200);

      const postLogoutRefresh = await apiRequest('/api/auth/refresh', {
        method: 'POST',
        body: { refreshToken: refreshed.data.data.refreshToken },
      });
      assert.equal(postLogoutRefresh.status, 401);
    });
  });

  describe('3. RBAC, Profile & Academic Management CRUD', () => {
    it('enforces authentication (401) and role permissions (403)', async () => {
      const noToken = await apiRequest('/api/users/me');
      assert.equal(noToken.status, 401);

      const studentOnAdminRoute = await apiRequest('/api/users', { token: harshToken });
      assert.equal(studentOnAdminRoute.status, 403);

      const harshProfile = await apiRequest('/api/users/me', { token: harshToken });
      assert.equal(harshProfile.status, 200);
      assert.equal(harshProfile.data.data.rollNumber, '2501730330');
      assert.equal(harshProfile.data.data.name, 'Harshwardhan');

      const adminUsers = await apiRequest('/api/users?role=student&page=1&limit=5', {
        token: adminToken,
      });
      assert.equal(adminUsers.status, 200);
      assert.ok(adminUsers.data.meta.totalItems >= 3);
    });

    it('handles Courses CRUD, 404 Not Found, and 400 CastError', async () => {
      const invalidId = await apiRequest('/api/courses/invalid-object-id', { token: adminToken });
      assert.equal(invalidId.status, 400);

      const notFound = await apiRequest('/api/courses/64f1c2e4a1b2c3d4e5f60000', {
        token: adminToken,
      });
      assert.equal(notFound.status, 404);

      const created = await apiRequest('/api/courses', {
        method: 'POST',
        token: adminToken,
        body: {
          code: 'CSEN2099',
          title: 'Cloud Native Architecture',
          credits: 3,
          department: 'Computer Science & Engineering',
          semester: 3,
        },
      });
      assert.equal(created.status, 201);
      const createdId = created.data.data._id;

      const updated = await apiRequest(`/api/courses/${createdId}`, {
        method: 'PATCH',
        token: adminToken,
        body: { credits: 4 },
      });
      assert.equal(updated.status, 200);
      assert.equal(updated.data.data.credits, 4);

      const deleted = await apiRequest(`/api/courses/${createdId}`, {
        method: 'DELETE',
        token: adminToken,
      });
      assert.equal(deleted.status, 200);
    });

    it('validates faculty role on Section creation and blocks duplicate Enrollments (409)', async () => {
      const badSection = await apiRequest('/api/sections', {
        method: 'POST',
        token: adminToken,
        body: {
          name: 'Section Z',
          course: course2001._id,
          faculty: harshUser._id, // Student, not faculty!
          semester: 3,
        },
      });
      assert.equal(badSection.status, 400);

      // Enroll newly registered Riya Kapoor into CSEN2001 Section A
      const enrollOk = await apiRequest('/api/enrollments', {
        method: 'POST',
        token: adminToken,
        body: {
          studentId: newStudentId,
          sectionId: section2001A._id,
        },
      });
      assert.equal(enrollOk.status, 201);

      // Duplicate enrollment must return 409 Conflict
      const enrollDup = await apiRequest('/api/enrollments', {
        method: 'POST',
        token: adminToken,
        body: {
          studentId: newStudentId,
          sectionId: section2001A._id,
        },
      });
      assert.equal(enrollDup.status, 409);

      const harshCourses = await apiRequest('/api/enrollments/my-courses', { token: harshToken });
      assert.equal(harshCourses.status, 200);
      assert.equal(harshCourses.data.data.length, 2);
    });
  });

  describe('4. Attendance Business Rules, Audit Trail & Student Privacy', () => {
    it('prevents faculty from marking attendance for an unassigned section (403)', async () => {
      const res = await apiRequest('/api/attendance/mark', {
        method: 'POST',
        token: faculty1Token, // Not assigned to CSEN2003 Section B
        body: {
          sectionId: section2003B._id,
          date: '2026-11-20',
          records: [{ studentId: harshUser._id, status: 'Present' }],
        },
      });
      assert.equal(res.status, 403);
    });

    it('marks attendance for assigned section, prevents duplicates (409), and records audit log on correction', async () => {
      const markOk = await apiRequest('/api/attendance/mark', {
        method: 'POST',
        token: faculty1Token,
        body: {
          sectionId: section2001A._id,
          date: '2026-11-20',
          sessionNumber: 1,
          records: [
            { studentId: harshUser._id, status: 'Present' },
            { studentId: aaravUser._id, status: 'Absent' },
          ],
        },
      });
      assert.equal(markOk.status, 201);
      assert.equal(markOk.data.data.length, 2);
      createdAttendanceId = markOk.data.data[0]._id;

      // Duplicate session attendance -> 409
      const markDup = await apiRequest('/api/attendance/mark', {
        method: 'POST',
        token: faculty1Token,
        body: {
          sectionId: section2001A._id,
          date: '2026-11-20',
          sessionNumber: 1,
          records: [{ studentId: harshUser._id, status: 'Present' }],
        },
      });
      assert.equal(markDup.status, 409);

      // Correct attendance with audit log
      const corrected = await apiRequest(`/api/attendance/${createdAttendanceId}`, {
        method: 'PATCH',
        token: faculty1Token,
        body: {
          status: 'Excused',
          reason: 'Represented K.R. Mangalam University in Inter-University Hackathon',
        },
      });
      assert.equal(corrected.status, 200);
      assert.equal(corrected.data.data.status, 'Excused');
      assert.equal(corrected.data.data.auditLog.length, 1);
      assert.equal(corrected.data.data.auditLog[0].previousStatus, 'Present');
      assert.equal(corrected.data.data.auditLog[0].newStatus, 'Excused');
    });

    it('enforces student privacy on attendance records', async () => {
      const own = await apiRequest('/api/attendance/my', { token: harshToken });
      assert.equal(own.status, 200);
      assert.ok(own.data.data.summary.length >= 2);

      const snooping = await apiRequest(`/api/attendance/student/${aaravUser._id}`, {
        token: harshToken,
      });
      assert.equal(snooping.status, 403);

      const facultyView = await apiRequest(`/api/attendance/student/${harshUser._id}`, {
        token: faculty1Token,
      });
      assert.equal(facultyView.status, 200);
      assert.equal(facultyView.data.data.student.rollNumber, '2501730330');
    });
  });

  describe('5. MongoDB Aggregation Pipelines & CSV Export', () => {
    it('returns attendance summary, low-attendance defaulters (<75%), enrollment stats, and CSV export', async () => {
      const summary = await apiRequest('/api/reports/attendance-summary', {
        token: faculty1Token,
      });
      assert.equal(summary.status, 200);
      assert.ok(summary.data.data.length >= 4);

      const lowAttendance = await apiRequest('/api/reports/low-attendance?threshold=75', {
        token: adminToken,
      });
      assert.equal(lowAttendance.status, 200);
      const defaulterRolls = lowAttendance.data.data.map((d) => d.rollNumber);
      assert.ok(defaulterRolls.includes('2501730331'), 'Aarav Verma should be flagged below 75%');
      assert.ok(!defaulterRolls.includes('2501730330'), 'Harshwardhan should not be flagged');

      const enrollmentStats = await apiRequest('/api/reports/enrollment-stats', {
        token: adminToken,
      });
      assert.equal(enrollmentStats.status, 200);
      assert.ok(Array.isArray(enrollmentStats.data.data.sectionWise));
      assert.ok(Array.isArray(enrollmentStats.data.data.courseWise));
      assert.ok(Array.isArray(enrollmentStats.data.data.departmentSummary));

      const csvRes = await apiRequest('/api/reports/attendance-summary/export', {
        token: faculty1Token,
      });
      assert.equal(csvRes.status, 200);
      assert.ok(csvRes.headers.get('content-type').includes('text/csv'));
      assert.ok(csvRes.data.includes('2501730330'));
      assert.ok(csvRes.data.includes('Harshwardhan'));
    });
  });

  describe('6. EventEmitter & Real-Time Socket.IO Notifications', () => {
    it('rejects unauthenticated Socket.IO connections', async () => {
      await assert.rejects(
        () =>
          new Promise((resolve, reject) => {
            const badSocket = ioClient(baseUrl, {
              transports: ['websocket'],
              reconnection: false,
            });
            badSocket.on('connect', () => {
              badSocket.disconnect();
              resolve('unexpectedly connected');
            });
            badSocket.on('connect_error', (err) => {
              badSocket.disconnect();
              reject(err);
            });
          }),
        /Authentication error/
      );
    });

    it('delivers real-time course announcements and low-attendance alerts via EventEmitter -> Socket.IO', async () => {
      const harshSocket = ioClient(baseUrl, {
        auth: { token: harshToken },
        transports: ['websocket'],
        reconnection: false,
      });
      const aaravSocket = ioClient(baseUrl, {
        auth: { token: aaravToken },
        transports: ['websocket'],
        reconnection: false,
      });

      await Promise.all([
        new Promise((resolve) => harshSocket.once('connection:ready', resolve)),
        new Promise((resolve) => aaravSocket.once('connection:ready', resolve)),
      ]);

      // Listen for live announcement on Harshwardhan's socket
      const announcementPromise = new Promise((resolve) => {
        harshSocket.once('announcement:new', resolve);
      });

      // Faculty cannot post university-wide notice -> 403
      const forbiddenUnivNotice = await apiRequest('/api/announcements', {
        method: 'POST',
        token: faculty1Token,
        body: {
          title: 'Unauthorized University Notice',
          content: 'Should be blocked by RBAC.',
          targetScope: 'university',
        },
      });
      assert.equal(forbiddenUnivNotice.status, 403);

      // Faculty posts course announcement for CSEN2001 -> triggers EventEmitter -> Socket.IO
      const postAnnouncement = await apiRequest('/api/announcements', {
        method: 'POST',
        token: faculty1Token,
        body: {
          title: 'Live Socket.IO Quiz Alert',
          content: 'Lab evaluation starts in 15 minutes in Block-A 304.',
          targetScope: 'course',
          course: course2001._id,
          priority: 'high',
        },
      });
      assert.equal(postAnnouncement.status, 201);

      const receivedAnnouncement = await announcementPromise;
      assert.equal(receivedAnnouncement.title, 'Live Socket.IO Quiz Alert');
      assert.equal(receivedAnnouncement.targetScope, 'course');

      // Listen for real-time attendance update + low-attendance alert on Aarav's socket
      const attendanceUpdatePromise = new Promise((resolve) => {
        aaravSocket.once('attendance:updated', resolve);
      });
      const lowAlertPromise = new Promise((resolve) => {
        aaravSocket.once('attendance:low_alert', resolve);
      });

      const markNewSession = await apiRequest('/api/attendance/mark', {
        method: 'POST',
        token: faculty1Token,
        body: {
          sectionId: section2001A._id,
          date: '2026-11-21',
          sessionNumber: 1,
          records: [{ studentId: aaravUser._id, status: 'Absent' }],
        },
      });
      assert.equal(markNewSession.status, 201);

      const [updatePayload, alertPayload] = await Promise.all([
        attendanceUpdatePromise,
        lowAlertPromise,
      ]);
      assert.equal(updatePayload.status, 'Absent');
      assert.ok(updatePayload.attendancePercentage < 75);
      assert.equal(alertPayload.threshold, 75);
      assert.equal(alertPayload.courseCode, 'CSEN2001');

      // Verify internal EventEmitter audit log via admin endpoint
      const eventHistory = await apiRequest('/api/events/history', { token: adminToken });
      assert.equal(eventHistory.status, 200);
      const eventNames = eventHistory.data.data.map((e) => e.event);
      assert.ok(eventNames.includes('announcement:published'));
      assert.ok(eventNames.includes('attendance:marked'));

      harshSocket.disconnect();
      aaravSocket.disconnect();
    });
  });
});

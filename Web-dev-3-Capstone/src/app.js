const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');

const ApiResponse = require('./utils/ApiResponse');
const appEmitter = require('./events/appEvents');
const { authenticate, authorize } = require('./middleware/auth.middleware');
const { httpMorganLogger, requestAuditLogger } = require('./middleware/logger.middleware');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const academicRoutes = require('./routes/academic.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const announcementRoutes = require('./routes/announcement.routes');
const reportRoutes = require('./routes/report.routes');

const app = express();

// Security & request parsing middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Logging & timing middleware
app.use(httpMorganLogger);
app.use(requestAuditLogger);

// Root & Health routes (demonstrating Node.js `process` module telemetry)
app.get('/', (_req, res) => {
  return ApiResponse.send(res, 200, 'K.R. Mangalam University Campus Management System API', {
    project: 'University Campus Management System',
    student: 'Harshwardhan',
    rollNumber: '2501730330',
    semester: 3,
    institution: 'K.R. Mangalam University',
    healthEndpoint: '/api/health',
  });
});

app.get('/api/health', (_req, res) => {
  const memory = process.memoryUsage();
  const dbStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];

  return ApiResponse.send(res, 200, 'Service healthy', {
    status: 'OK',
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    pid: process.pid,
    uptimeSeconds: Math.round(process.uptime()),
    memoryMB: {
      rss: Math.round((memory.rss / 1024 / 1024) * 100) / 100,
      heapUsed: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
    },
    database: {
      state: dbStates[mongoose.connection.readyState] || 'unknown',
      name: mongoose.connection.name || null,
    },
    timestamp: new Date().toISOString(),
  });
});

// Mount REST API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api', academicRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/reports', reportRoutes);

// Admin endpoint to inspect recent EventEmitter internal activity
app.get('/api/events/history', authenticate, authorize('admin'), (_req, res) => {
  return ApiResponse.send(
    res,
    200,
    'Recent internal EventEmitter activity',
    appEmitter.getEventHistory()
  );
});

// Centralized 404 & Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

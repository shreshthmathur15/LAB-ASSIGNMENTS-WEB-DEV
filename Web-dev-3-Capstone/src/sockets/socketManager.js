const { Server } = require('socket.io');
const mongoose = require('mongoose');
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');
const Section = require('../models/Section');
const { verifyAccessToken } = require('../utils/jwt');
const appEmitter = require('../events/appEvents');

/**
 * Joins the authenticated socket to its role, personal, course, and section rooms.
 * @param {import('socket.io').Socket} socket
 */
const joinAuthorizedRooms = async (socket) => {
  const user = socket.user;
  const userId = user._id.toString();

  socket.join('university');
  socket.join(`user:${userId}`);
  socket.join(`role:${user.role}`);

  if (user.role === 'student') {
    const enrollments = await Enrollment.find({ student: user._id, status: 'active' }).select(
      'course section'
    );
    for (const enrollment of enrollments) {
      socket.join(`course:${enrollment.course.toString()}`);
      socket.join(`section:${enrollment.section.toString()}`);
    }
  } else if (user.role === 'faculty') {
    const sections = await Section.find({ faculty: user._id }).select('_id course');
    for (const section of sections) {
      socket.join(`course:${section.course.toString()}`);
      socket.join(`section:${section._id.toString()}`);
    }
  }
};

/**
 * Initializes and configures the Socket.IO server with JWT handshake authentication
 * and room-based authorization.
 *
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
const initializeSocketServer = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Socket.IO authentication middleware: rejects unauthenticated handshakes
  io.use(async (socket, next) => {
    try {
      let token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token && socket.handshake.headers && socket.handshake.headers.authorization) {
        const authHeader = socket.handshake.headers.authorization;
        if (authHeader.startsWith('Bearer ')) {
          token = authHeader.slice(7).trim();
        }
      }

      if (!token) {
        return next(new Error('Authentication error: Missing JWT token'));
      }

      const decoded = verifyAccessToken(token);
      const user = await User.findById(decoded.sub);
      if (!user || !user.isActive) {
        return next(new Error('Authentication error: User inactive or not found'));
      }

      socket.user = user;
      return next();
    } catch (_err) {
      return next(new Error('Authentication error: Invalid or expired JWT token'));
    }
  });

  io.on('connection', async (socket) => {
    try {
      await joinAuthorizedRooms(socket);

      socket.emit('connection:ready', {
        userId: socket.user._id,
        role: socket.user.role,
        rooms: Array.from(socket.rooms),
      });
    } catch (err) {
      console.error('[Socket.IO] Failed joining initial rooms:', err.message);
    }

    // Allow authenticated users to subscribe to an authorized course/section room dynamically
    socket.on('join:room', async (payload = {}, callback) => {
      const reply = typeof callback === 'function' ? callback : () => {};
      const { type, id } = payload;

      if (!['course', 'section'].includes(type) || !mongoose.isValidObjectId(id)) {
        return reply({ ok: false, error: 'Invalid room type or ID' });
      }

      const user = socket.user;
      let permitted = user.role === 'admin';

      if (!permitted && user.role === 'student') {
        const query =
          type === 'course'
            ? { student: user._id, course: id, status: 'active' }
            : { student: user._id, section: id, status: 'active' };
        permitted = Boolean(await Enrollment.exists(query));
      } else if (!permitted && user.role === 'faculty') {
        const query =
          type === 'course' ? { faculty: user._id, course: id } : { faculty: user._id, _id: id };
        permitted = Boolean(await Section.exists(query));
      }

      if (!permitted) {
        return reply({ ok: false, error: 'Forbidden: Not authorized for this room' });
      }

      const roomName = `${type}:${id}`;
      await socket.join(roomName);
      return reply({ ok: true, room: roomName });
    });

    socket.on('disconnect', () => {
      // Connection cleanup handled automatically by Socket.IO
    });
  });

  appEmitter.setSocketServer(io);
  return io;
};

module.exports = {
  initializeSocketServer,
};

const EventEmitter = require('events');
const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');

/**
 * Application-wide EventEmitter implementing decoupled internal event handling
 * and bridging domain events to real-time Socket.IO notifications.
 */
class AppEmitter extends EventEmitter {
  constructor() {
    super();
    this.io = null;
    this.eventHistory = [];
    this.registerListeners();
  }

  /**
   * Attaches the initialized Socket.IO server instance.
   * @param {import('socket.io').Server} io
   */
  setSocketServer(io) {
    this.io = io;
  }

  /**
   * Appends an internal event record to a bounded in-memory audit buffer.
   * @param {string} eventName
   * @param {object} summary
   */
  recordEvent(eventName, summary) {
    this.eventHistory.unshift({
      event: eventName,
      timestamp: new Date().toISOString(),
      ...summary,
    });
    if (this.eventHistory.length > 100) {
      this.eventHistory.pop();
    }
  }

  /**
   * Returns recent internal EventEmitter logs.
   * @returns {Array<object>}
   */
  getEventHistory() {
    return this.eventHistory;
  }

  /**
   * Registers listeners for all core campus domain events.
   */
  registerListeners() {
    this.on('announcement:published', ({ announcement }) => {
      try {
        this.recordEvent('announcement:published', {
          announcementId: announcement._id?.toString(),
          targetScope: announcement.targetScope,
          priority: announcement.priority,
        });

        if (!this.io) return;

        const payload = {
          _id: announcement._id,
          title: announcement.title,
          content: announcement.content,
          targetScope: announcement.targetScope,
          priority: announcement.priority,
          course: announcement.course || null,
          section: announcement.section || null,
          author: announcement.author,
          createdAt: announcement.createdAt,
        };

        if (announcement.targetScope === 'university') {
          this.io.to('university').emit('announcement:new', payload);
        } else if (announcement.targetScope === 'course' && announcement.course) {
          const courseId = announcement.course._id
            ? announcement.course._id.toString()
            : announcement.course.toString();
          this.io.to(`course:${courseId}`).emit('announcement:new', payload);
        } else if (announcement.targetScope === 'section' && announcement.section) {
          const sectionId = announcement.section._id
            ? announcement.section._id.toString()
            : announcement.section.toString();
          this.io.to(`section:${sectionId}`).emit('announcement:new', payload);
        }
      } catch (err) {
        console.error('[AppEmitter] Error in announcement:published listener:', err.message);
      }
    });

    this.on('attendance:marked', async ({ records, course, section, date }) => {
      try {
        this.recordEvent('attendance:marked', {
          courseId: course._id?.toString(),
          sectionId: section._id?.toString(),
          count: records.length,
          date,
        });

        if (!this.io || !records.length) return;

        const threshold = Number(process.env.LOW_ATTENDANCE_THRESHOLD || 75);
        const studentIds = records.map((r) => new mongoose.Types.ObjectId(r.student));

        // Compute up-to-date subject attendance percentages via aggregation
        const stats = await Attendance.aggregate([
          {
            $match: {
              course: new mongoose.Types.ObjectId(course._id),
              student: { $in: studentIds },
            },
          },
          {
            $group: {
              _id: '$student',
              totalClasses: { $sum: 1 },
              attendedClasses: {
                $sum: {
                  $cond: [{ $in: ['$status', ['Present', 'Late']] }, 1, 0],
                },
              },
            },
          },
          {
            $addFields: {
              attendancePercentage: {
                $round: [
                  {
                    $multiply: [{ $divide: ['$attendedClasses', '$totalClasses'] }, 100],
                  },
                  2,
                ],
              },
            },
          },
        ]);

        const statsByStudent = new Map(stats.map((s) => [s._id.toString(), s]));

        for (const rec of records) {
          const studentIdStr = rec.student.toString();
          const studentStat = statsByStudent.get(studentIdStr) || {
            totalClasses: 1,
            attendedClasses: ['Present', 'Late'].includes(rec.status) ? 1 : 0,
            attendancePercentage: ['Present', 'Late'].includes(rec.status) ? 100 : 0,
          };

          this.io.to(`user:${studentIdStr}`).emit('attendance:updated', {
            attendanceId: rec._id,
            courseId: course._id,
            courseCode: course.code,
            courseTitle: course.title,
            sectionId: section._id,
            date: rec.date,
            sessionNumber: rec.sessionNumber,
            status: rec.status,
            attendancePercentage: studentStat.attendancePercentage,
            totalClasses: studentStat.totalClasses,
            attendedClasses: studentStat.attendedClasses,
          });

          if (studentStat.attendancePercentage < threshold) {
            this.io.to(`user:${studentIdStr}`).emit('attendance:low_alert', {
              courseId: course._id,
              courseCode: course.code,
              courseTitle: course.title,
              attendancePercentage: studentStat.attendancePercentage,
              threshold,
              message: `Alert: Your attendance in ${course.code} (${course.title}) is ${studentStat.attendancePercentage}%, below the required ${threshold}%.`,
            });
          }
        }
      } catch (err) {
        console.error('[AppEmitter] Error in attendance:marked listener:', err.message);
      }
    });

    this.on('attendance:corrected', ({ record, previousStatus, newStatus, reason }) => {
      try {
        this.recordEvent('attendance:corrected', {
          attendanceId: record._id?.toString(),
          studentId: record.student?.toString(),
          previousStatus,
          newStatus,
          reason,
        });

        if (!this.io) return;

        const studentIdStr = record.student._id
          ? record.student._id.toString()
          : record.student.toString();

        this.io.to(`user:${studentIdStr}`).emit('attendance:updated', {
          attendanceId: record._id,
          courseId: record.course,
          sectionId: record.section,
          date: record.date,
          sessionNumber: record.sessionNumber,
          previousStatus,
          status: newStatus,
          reason,
          corrected: true,
        });
      } catch (err) {
        console.error('[AppEmitter] Error in attendance:corrected listener:', err.message);
      }
    });

    this.on('enrollment:created', ({ enrollment, course, section }) => {
      try {
        const studentIdStr = enrollment.student.toString();
        this.recordEvent('enrollment:created', {
          enrollmentId: enrollment._id?.toString(),
          studentId: studentIdStr,
          courseId: course._id?.toString(),
        });

        if (!this.io) return;

        this.io.to(`course:${course._id.toString()}`);
        this.io.to(`user:${studentIdStr}`).emit('enrollment:confirmed', {
          enrollmentId: enrollment._id,
          courseId: course._id,
          courseCode: course.code,
          courseTitle: course.title,
          sectionId: section._id,
          sectionName: section.name,
        });
      } catch (err) {
        console.error('[AppEmitter] Error in enrollment:created listener:', err.message);
      }
    });
  }
}

const appEmitter = new AppEmitter();

module.exports = appEmitter;

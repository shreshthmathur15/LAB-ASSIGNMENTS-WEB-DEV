require('dotenv').config();

const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/User');
const Course = require('../models/Course');
const Section = require('../models/Section');
const Enrollment = require('../models/Enrollment');
const Attendance = require('../models/Attendance');
const Announcement = require('../models/Announcement');

const seedDatabase = async () => {
  console.log('[Seed] Clearing existing collections...');
  await Promise.all([
    Announcement.deleteMany({}),
    Attendance.deleteMany({}),
    Enrollment.deleteMany({}),
    Section.deleteMany({}),
    Course.deleteMany({}),
    User.deleteMany({}),
  ]);

  console.log('[Seed] Creating K.R. Mangalam University users...');
  const admin = await User.create({
    name: 'Dr. Rajesh Kumar',
    email: 'admin@krmangalam.edu.in',
    password: 'Password@123',
    role: 'admin',
    employeeId: 'KRMU-ADM-001',
    department: 'University Administration',
    phone: '+91-9810000001',
  });

  const faculty1 = await User.create({
    name: 'Prof. Ananya Sharma',
    email: 'ananya.sharma@krmangalam.edu.in',
    password: 'Password@123',
    role: 'faculty',
    employeeId: 'KRMU-FAC-101',
    department: 'Computer Science & Engineering',
    phone: '+91-9810000101',
  });

  const faculty2 = await User.create({
    name: 'Dr. Vikram Mehta',
    email: 'vikram.mehta@krmangalam.edu.in',
    password: 'Password@123',
    role: 'faculty',
    employeeId: 'KRMU-FAC-102',
    department: 'Computer Science & Engineering',
    phone: '+91-9810000102',
  });

  const harshwardhan = await User.create({
    name: 'Harshwardhan',
    email: 'harshwardhan@krmangalam.edu.in',
    password: 'Password@123',
    role: 'student',
    rollNumber: '2501730330',
    department: 'Computer Science & Engineering',
    semester: 3,
    phone: '+91-9810030330',
  });

  const aarav = await User.create({
    name: 'Aarav Verma',
    email: 'aarav.verma@krmangalam.edu.in',
    password: 'Password@123',
    role: 'student',
    rollNumber: '2501730331',
    department: 'Computer Science & Engineering',
    semester: 3,
    phone: '+91-9810030331',
  });

  const priya = await User.create({
    name: 'Priya Nair',
    email: 'priya.nair@krmangalam.edu.in',
    password: 'Password@123',
    role: 'student',
    rollNumber: '2501730332',
    department: 'Computer Science & Engineering',
    semester: 3,
    phone: '+91-9810030332',
  });

  console.log('[Seed] Creating courses...');
  const [csen2001, csen2002, csen2003] = await Course.create([
    {
      code: 'CSEN2001',
      title: 'Backend Development',
      description: 'Node.js, Express.js, MongoDB, Mongoose, JWT Security and Socket.IO',
      credits: 4,
      department: 'Computer Science & Engineering',
      semester: 3,
    },
    {
      code: 'CSEN2002',
      title: 'Data Structures & Algorithms',
      description: 'Linear and non-linear data structures, graphs, trees and algorithm analysis',
      credits: 4,
      department: 'Computer Science & Engineering',
      semester: 3,
    },
    {
      code: 'CSEN2003',
      title: 'Database Management Systems',
      description: 'Relational modeling, normalization, transactions and NoSQL systems',
      credits: 3,
      department: 'Computer Science & Engineering',
      semester: 3,
    },
  ]);

  console.log('[Seed] Creating sections and assigning faculty...');
  const [sec2001A, sec2002A, sec2003B] = await Section.create([
    {
      name: 'Section A',
      course: csen2001._id,
      faculty: faculty1._id,
      academicYear: '2026-2027',
      semester: 3,
      maxCapacity: 60,
      schedule: { days: ['Mon', 'Wed', 'Fri'], timeSlot: '09:30 - 10:30', room: 'Block-A 304' },
    },
    {
      name: 'Section A',
      course: csen2002._id,
      faculty: faculty1._id,
      academicYear: '2026-2027',
      semester: 3,
      maxCapacity: 60,
      schedule: { days: ['Tue', 'Thu'], timeSlot: '11:00 - 12:30', room: 'Block-A 202' },
    },
    {
      name: 'Section B',
      course: csen2003._id,
      faculty: faculty2._id,
      academicYear: '2026-2027',
      semester: 3,
      maxCapacity: 60,
      schedule: { days: ['Mon', 'Thu'], timeSlot: '14:00 - 15:30', room: 'Block-B 105' },
    },
  ]);

  console.log('[Seed] Enrolling students...');
  await Enrollment.create([
    // Harshwardhan (2501730330) enrolled in CSEN2001 & CSEN2002
    { student: harshwardhan._id, course: csen2001._id, section: sec2001A._id },
    { student: harshwardhan._id, course: csen2002._id, section: sec2002A._id },
    // Aarav Verma (2501730331) enrolled in CSEN2001 & CSEN2002
    { student: aarav._id, course: csen2001._id, section: sec2001A._id },
    { student: aarav._id, course: csen2002._id, section: sec2002A._id },
    // Priya Nair (2501730332) enrolled in CSEN2001 & CSEN2003
    { student: priya._id, course: csen2001._id, section: sec2001A._id },
    { student: priya._id, course: csen2003._id, section: sec2003B._id },
  ]);

  console.log('[Seed] Creating multi-day attendance sessions (with audit trail example)...');
  const dates2001 = [
    '2026-11-02',
    '2026-11-04',
    '2026-11-06',
    '2026-11-09',
    '2026-11-11',
    '2026-11-13',
    '2026-11-16',
  ];
  // Harshwardhan: 6/7 = 85.71% | Aarav: 3/7 = 42.86% (defaulter) | Priya: 6/7 = 85.71%
  const harshStatuses2001 = ['Present', 'Present', 'Present', 'Late', 'Absent', 'Present', 'Present'];
  const aaravStatuses2001 = ['Present', 'Absent', 'Absent', 'Present', 'Absent', 'Absent', 'Present'];
  const priyaStatuses2001 = ['Present', 'Present', 'Absent', 'Present', 'Present', 'Present', 'Present'];

  const attendanceDocs = [];
  dates2001.forEach((d, idx) => {
    attendanceDocs.push({
      course: csen2001._id,
      section: sec2001A._id,
      student: harshwardhan._id,
      markedBy: faculty1._id,
      date: d,
      sessionNumber: 1,
      status: harshStatuses2001[idx],
      auditLog:
        idx === 3
          ? [
              {
                previousStatus: 'Absent',
                newStatus: 'Late',
                changedBy: faculty1._id,
                reason: 'Student arrived 5 minutes after roll call due to lab handover',
                changedAt: new Date('2026-11-09T11:00:00Z'),
              },
            ]
          : [],
    });

    attendanceDocs.push({
      course: csen2001._id,
      section: sec2001A._id,
      student: aarav._id,
      markedBy: faculty1._id,
      date: d,
      sessionNumber: 1,
      status: aaravStatuses2001[idx],
    });

    attendanceDocs.push({
      course: csen2001._id,
      section: sec2001A._id,
      student: priya._id,
      markedBy: faculty1._id,
      date: d,
      sessionNumber: 1,
      status: priyaStatuses2001[idx],
    });
  });

  // CSEN2002 (5 sessions): Harshwardhan 5/5 = 100%, Aarav 2/5 = 40% (defaulter)
  const dates2002 = ['2026-11-03', '2026-11-05', '2026-11-10', '2026-11-12', '2026-11-17'];
  const aaravStatuses2002 = ['Present', 'Absent', 'Absent', 'Present', 'Absent'];
  dates2002.forEach((d, idx) => {
    attendanceDocs.push({
      course: csen2002._id,
      section: sec2002A._id,
      student: harshwardhan._id,
      markedBy: faculty1._id,
      date: d,
      sessionNumber: 1,
      status: 'Present',
    });
    attendanceDocs.push({
      course: csen2002._id,
      section: sec2002A._id,
      student: aarav._id,
      markedBy: faculty1._id,
      date: d,
      sessionNumber: 1,
      status: aaravStatuses2002[idx],
    });
  });

  // CSEN2003 (4 sessions): Priya 4/4 = 100%
  const dates2003 = ['2026-11-02', '2026-11-05', '2026-11-09', '2026-11-12'];
  dates2003.forEach((d) => {
    attendanceDocs.push({
      course: csen2003._id,
      section: sec2003B._id,
      student: priya._id,
      markedBy: faculty2._id,
      date: d,
      sessionNumber: 1,
      status: 'Present',
    });
  });

  await Attendance.insertMany(attendanceDocs);

  console.log('[Seed] Creating campus announcements...');
  await Announcement.create([
    {
      title: 'KRMU Semester 3 End-Term Capstone Submission Notice',
      content:
        'All B.Tech CSE Semester 3 students must upload their Backend Development Capstone source code, API documentation, and Postman collection before the final viva schedule.',
      author: admin._id,
      targetScope: 'university',
      priority: 'urgent',
      isPinned: true,
    },
    {
      title: 'CSEN2001: Express & Socket.IO Lab Evaluation Guidelines',
      content:
        'Be prepared to demonstrate JWT authentication, role-based access control, aggregation pipelines, and live Socket.IO event delivery via Postman and CLI.',
      author: faculty1._id,
      targetScope: 'course',
      course: csen2001._id,
      priority: 'high',
      isPinned: false,
    },
    {
      title: 'Section A Extra Doubt-Clearing Session',
      content:
        'An extra session on MongoDB aggregation pipelines will be held in Block-A 304 on Friday at 15:00.',
      author: faculty1._id,
      targetScope: 'section',
      course: csen2001._id,
      section: sec2001A._id,
      priority: 'normal',
      isPinned: false,
    },
  ]);

  console.log('[Seed] Database seeding complete!');
  console.log('-------------------------------------------------------------');
  console.log('Seeded Credentials (Password for all accounts: Password@123):');
  console.log('  Admin   : admin@krmangalam.edu.in');
  console.log('  Faculty1: ananya.sharma@krmangalam.edu.in');
  console.log('  Faculty2: vikram.mehta@krmangalam.edu.in');
  console.log('  Student1: harshwardhan@krmangalam.edu.in (Roll No: 2501730330)');
  console.log('  Student2: aarav.verma@krmangalam.edu.in  (Roll No: 2501730331 - <75% attendance)');
  console.log('  Student3: priya.nair@krmangalam.edu.in   (Roll No: 2501730332)');
  console.log('-------------------------------------------------------------');
};

if (require.main === module) {
  connectDB(process.env.MONGODB_URI)
    .then(() => seedDatabase())
    .then(() => disconnectDB())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error('[Seed] Error:', err);
      await disconnectDB();
      process.exit(1);
    });
}

module.exports = { seedDatabase };

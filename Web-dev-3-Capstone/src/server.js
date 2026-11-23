const http = require('http');
require('dotenv').config();

const app = require('./app');
const { connectDB, disconnectDB } = require('./config/db');
const { initializeSocketServer } = require('./sockets/socketManager');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB(process.env.MONGODB_URI);

    const httpServer = http.createServer(app);
    initializeSocketServer(httpServer);

    httpServer.listen(PORT, () => {
      console.log(`[Server] KRMU Campus Management Backend running on http://localhost:${PORT}`);
      console.log(`[Socket.IO] Real-time notification engine initialized`);
    });

    const shutdown = async (signal) => {
      console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
      httpServer.close(async () => {
        await disconnectDB();
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    console.error('[Server] Fatal startup error:', err.message);
    process.exit(1);
  }
};

startServer();

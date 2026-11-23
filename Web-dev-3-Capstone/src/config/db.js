const mongoose = require('mongoose');

/**
 * Connects to MongoDB using Mongoose.
 * @param {string} uri - MongoDB connection URI.
 * @returns {Promise<typeof mongoose>} Active Mongoose connection instance.
 */
const connectDB = async (uri) => {
  const connectionUri = uri || process.env.MONGODB_URI;
  if (!connectionUri) {
    throw new Error('MONGODB_URI is not defined in environment variables.');
  }

  mongoose.set('strictQuery', true);
  const conn = await mongoose.connect(connectionUri);

  if (process.env.NODE_ENV !== 'test') {
    console.log(`[MongoDB] Connected: ${conn.connection.host}/${conn.connection.name}`);
  }

  return conn;
};

/**
 * Gracefully disconnects from MongoDB.
 * @returns {Promise<void>}
 */
const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    if (process.env.NODE_ENV !== 'test') {
      console.log('[MongoDB] Disconnected gracefully.');
    }
  }
};

module.exports = {
  connectDB,
  disconnectDB,
};

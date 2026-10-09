import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

mongoose.set('strictQuery', true);

export async function connectDb(uri = env.MONGODB_URI) {
  await mongoose.connect(uri, { autoIndex: !env.isProduction, serverSelectionTimeoutMS: 30000 });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName) {
    throw new Error('MongoDB must run as a replica set (transactions are required). Use `npm run dev:db` or a replica-set URI.');
  }
  logger.info(`MongoDB connected (${mongoose.connection.name})`);
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

export const withTransaction = (fn) => mongoose.connection.transaction((session) => fn(session));

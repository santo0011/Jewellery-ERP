import './transactions.js';
import mongoose from 'mongoose';
import { getContext, runWithContext } from '../core/context/requestContext.js';
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

/**
 * Runs `fn` in a transaction. Called while one is already open (an undo running a module's own cancel, say), it joins
 * that one, so everything commits — or rolls back — together.
 */
export function withTransaction(fn) {
  const ctx = getContext();
  if (ctx?.txSession) return fn(ctx.txSession);
  return mongoose.connection.transaction((session) => runWithContext({ ...ctx, txSession: session }, () => fn(session)));
}

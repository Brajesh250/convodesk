import mongoose from 'mongoose';
import { logger } from '../observability/logger.js';

// Reject queries that filter on fields not in the schema instead of silently ignoring them.
mongoose.set('strictQuery', true);

/**
 * Connects to MongoDB (Atlas M0 in production).
 * - `maxPoolSize` is kept small: the M0 shared tier caps connections at 500 across ALL clients,
 *   and a single Render instance never needs more than a handful.
 * - `serverSelectionTimeoutMS` makes a wrong URI / blocked IP fail fast at boot
 *   instead of hanging the deploy.
 */
export async function connectMongo(uri: string): Promise<typeof mongoose> {
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));

  await mongoose.connect(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10_000,
    appName: 'convodesk',
  });
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
  return mongoose;
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}

const STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'] as const;
export type DbState = (typeof STATES)[number];

/** Mongoose readyState as a readable label (99 = "uninitialized" is reported as disconnected). */
export function dbState(): DbState {
  const state: number = mongoose.connection.readyState;
  return STATES[state] ?? 'disconnected';
}

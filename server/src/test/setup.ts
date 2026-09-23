import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, inject } from 'vitest';

/**
 * Per-test-file setup: each file connects to its OWN database on the shared server,
 * so test files can run in parallel without seeing each other's data.
 * Collections are emptied after every test to keep tests independent.
 */
beforeAll(async () => {
  const baseUri = inject('mongoUri');
  const dbName = `test_${randomUUID().replaceAll('-', '')}`;
  process.env.MONGODB_URI = baseUri;
  await mongoose.connect(baseUri, { dbName });
  // Build unique/TTL indexes up front so tests that rely on them (e.g. duplicate email) are deterministic.
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).init()));
});

afterEach(async () => {
  const collections = await mongoose.connection.db?.collections();
  await Promise.all((collections ?? []).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.db?.dropDatabase();
  await mongoose.disconnect();
});

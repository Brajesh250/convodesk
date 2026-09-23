import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

/**
 * Starts ONE in-memory MongoDB for the whole test run.
 * A replica set (not a standalone) so multi-document transactions work in later phases.
 * If MONGODB_TEST_URI is set (e.g. a local mongod), we use that instead of downloading one.
 */
let replSet: MongoMemoryReplSet | undefined;

export async function setup(project: TestProject): Promise<void> {
  const external = process.env.MONGODB_TEST_URI;
  if (external) {
    project.provide('mongoUri', external);
    return;
  }
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  project.provide('mongoUri', replSet.getUri());
}

export async function teardown(): Promise<void> {
  await replSet?.stop();
}

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}

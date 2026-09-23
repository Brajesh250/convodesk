import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // One in-memory MongoDB replica set is started for the whole run (see globalSetup),
    // and each test file gets its own database name, so files can run in parallel safely.
    globalSetup: ['./src/test/global-setup.ts'],
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 120_000, // first run downloads the mongod binary
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      JWT_ACCESS_SECRET: 'test-secret-that-is-long-enough-for-hs256-signing',
      BCRYPT_ROUNDS: '4', // fast hashing in tests
      RATE_LIMIT_ENABLED: 'false', // limiter behaviour has its own dedicated test
      APP_URL: 'http://localhost:4200',
    },
  },
});

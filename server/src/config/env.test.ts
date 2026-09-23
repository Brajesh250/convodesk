import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

describe('parseEnv', () => {
  it('applies defaults and splits CORS_ORIGINS', () => {
    const env = parseEnv({
      MONGODB_URI: 'mongodb://localhost:27017/convodesk',
      CORS_ORIGINS: 'http://localhost:4200, https://app.example.com',
    });
    expect(env.PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:4200', 'https://app.example.com']);
  });

  it('fails fast with a readable message when required config is missing', () => {
    expect(() => parseEnv({})).toThrow(/MONGODB_URI/);
  });

  it('rejects a non-mongo connection string', () => {
    expect(() => parseEnv({ MONGODB_URI: 'postgres://nope' })).toThrow(/mongodb:\/\//);
  });
});

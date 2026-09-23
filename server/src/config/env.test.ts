import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

const base = {
  MONGODB_URI: 'mongodb://localhost:27017/convodesk',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('parseEnv', () => {
  it('applies defaults and splits CORS_ORIGINS', () => {
    const env = parseEnv({ ...base, CORS_ORIGINS: 'http://localhost:4200, https://app.example.com' });
    expect(env.PORT).toBe(4000);
    expect(env.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:4200', 'https://app.example.com']);
  });

  it('fails fast with a readable message when required config is missing', () => {
    expect(() => parseEnv({})).toThrow(/MONGODB_URI/);
    expect(() => parseEnv({ MONGODB_URI: base.MONGODB_URI })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects a non-mongo connection string', () => {
    expect(() => parseEnv({ ...base, MONGODB_URI: 'postgres://nope' })).toThrow(/mongodb:\/\//);
  });

  it('rejects a short JWT secret', () => {
    expect(() => parseEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/at least 32/);
  });

  it('defaults COOKIE_SECURE to true only in production', () => {
    expect(parseEnv({ ...base, NODE_ENV: 'development' }).COOKIE_SECURE).toBe(false);
    expect(parseEnv({ ...base, NODE_ENV: 'production' }).COOKIE_SECURE).toBe(true);
  });

  it('refuses SameSite=None without Secure (browsers would drop the cookie)', () => {
    expect(() => parseEnv({ ...base, COOKIE_SAMESITE: 'none', COOKIE_SECURE: 'false' })).toThrow(
      /requires COOKIE_SECURE/,
    );
  });
});

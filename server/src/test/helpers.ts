import { createApp } from '../app.js';

export const TEST_ORIGIN = 'http://localhost:4200';

/** A fresh Express app configured the way tests expect. */
export function buildTestApp() {
  return createApp({ corsOrigins: [TEST_ORIGIN] });
}

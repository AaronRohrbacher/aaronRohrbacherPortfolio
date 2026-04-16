import { defineConfig } from '@playwright/test';
import { resolve } from 'path';
import { existsSync } from 'fs';

// Ensure SDKMAN Java is in PATH for DynamoDB Local
const sdkmanJava = resolve(process.env.HOME, '.sdkman/candidates/java/current/bin');
const extraPath = existsSync(sdkmanJava) ? `${sdkmanJava}:` : '';

export default defineConfig({
  testDir: './tests',
  // Reset the local dev DB to a known baseline before every test run.
  // Music tests mutate state in place and don't fully restore; this keeps
  // runs deterministic without per-test cleanup.
  globalSetup: './tests/global-setup.mjs',
  // Node-only unit tests live under tests/unit and are run via
  // `node --test` from the test:unit npm script. Exclude them from
  // Playwright discovery so it doesn't try to load ESM source files
  // via its own loader.
  testIgnore: ['**/unit/**'],
  timeout: 60000,
  retries: 0,
  // All tests share the local DynamoDB Local instance via the dev server,
  // so files must run sequentially or they'd race for table state.
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: true,
    timeout: 30000,
    env: {
      PATH: `${extraPath}${process.env.PATH}`,
      // Forward NODE_V8_COVERAGE so the dev server (and its child Next.js
      // process) writes V8 coverage data to the directory the parent set.
      // Empty string means: don't override; the child inherits process.env.
      ...(process.env.NODE_V8_COVERAGE
        ? { NODE_V8_COVERAGE: process.env.NODE_V8_COVERAGE }
        : {}),
    },
  },
});

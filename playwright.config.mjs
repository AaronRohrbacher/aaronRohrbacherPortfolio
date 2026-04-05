import { defineConfig } from '@playwright/test';
import { resolve } from 'path';
import { existsSync } from 'fs';

// Ensure SDKMAN Java is in PATH for DynamoDB Local
const sdkmanJava = resolve(process.env.HOME, '.sdkman/candidates/java/current/bin');
const extraPath = existsSync(sdkmanJava) ? `${sdkmanJava}:` : '';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 0,
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
    },
  },
});

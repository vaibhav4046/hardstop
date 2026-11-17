import { defineConfig } from '@playwright/test'

// The suite runs against the production build on port 3220. Persona and
// accessibility specs run in parallel; the performance spec runs afterwards,
// alone, so that other tests do not disturb its timings.
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['json', { outputFile: '../qa/metrics/playwright-results.json' }]],
  use: {
    baseURL: 'http://localhost:3220',
    browserName: 'chromium',
    // Failure screenshots go to test-results/; the evidence screenshots the
    // specs take on purpose go to ../qa/screenshots/ (see e2e/helpers.ts).
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'suite', testIgnore: /performance\.spec\.ts/ },
    { name: 'perf', testMatch: /performance\.spec\.ts/, dependencies: ['suite'], fullyParallel: false, workers: 1 },
  ],
  webServer: {
    command: 'npm run build && npx next start -p 3220',
    url: 'http://localhost:3220',
    // Set E2E_REUSE_SERVER=1 to use a server already listening on 3220 (only while iterating).
    reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})

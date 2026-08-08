/**
 * Playwright end-to-end configuration.
 *
 * These tests drive a real browser against a real FastAPI backend and a real
 * seeded PostgreSQL database — the same path a person takes when they open the
 * admin panel. Nothing is mocked, deliberately: the failures worth catching
 * here (a role that 403s, a chart that renders empty, two screens disagreeing
 * about the same number) all live in the seam between the client and server,
 * which is exactly what a mock hides.
 *
 * Running them:
 *   1. Start PostgreSQL and apply migrations/*.sql — the seed data those files
 *      create IS the fixture. There is no separate test-data setup.
 *   2. Start the backend on :8000.
 *   3. npm run test:e2e
 *
 * Vite serves the app and proxies /api to :8000, so the browser talks to one
 * origin and no CORS configuration is involved. Point E2E_BASE_URL elsewhere to
 * run the same suite against a deployed environment.
 */
import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173';

export default defineConfig({
    testDir: './e2e',
    // Serial by default: these tests share one seeded database, and a suite that
    // reads totals cannot also be racing writes against them.
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    timeout: 60_000,
    expect: { timeout: 15_000 },
    reporter: process.env.CI
        ? [['github'], ['html', { open: 'never' }], ['list']]
        : [['list'], ['html', { open: 'never' }]],

    use: {
        baseURL: BASE_URL,
        // Traces and screenshots only on failure — enough to diagnose a CI-only
        // break without dragging a gigabyte of video through every green run.
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'off',
        actionTimeout: 15_000,
        navigationTimeout: 30_000,
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1000 } },
        },
    ],

    // Skipped when E2E_BASE_URL points at an already-running or deployed app.
    webServer: process.env.E2E_BASE_URL
        ? undefined
        : {
              command: 'npm run preview -- --port 4173 --host 127.0.0.1',
              url: BASE_URL,
              reuseExistingServer: !process.env.CI,
              timeout: 120_000,
          },
});

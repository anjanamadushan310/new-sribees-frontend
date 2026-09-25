/**
 * Unit and component tests (Vitest + Testing Library, jsdom).
 *
 * Separate from vite.config.ts so the production build config stays exactly
 * what ships. The end-to-end suite (Playwright, e2e/) is a different layer:
 * that one drives a real browser against a real backend; this one pins the
 * logic the pages are built on -- permissions, the API client's token
 * handling, money and time formatting -- in milliseconds, on every push.
 */
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: false,
        setupFiles: ['./src/test/setup.ts'],
        include: ['src/**/*.test.{ts,tsx}'],
        // Sri Lanka time is the product's time; run the suite in a zone that is
        // NOT Colombo so a helper that leans on the machine's zone fails here.
        env: { TZ: 'America/New_York' },
        coverage: {
            provider: 'v8',
            reporter: ['text-summary', 'lcov', 'json-summary'],
            include: ['src/utils/**', 'src/hooks/**', 'src/store/**', 'src/api/client.ts', 'src/components/guards/**'],
            // A ratchet, set just under what the suite measures today: raise it as
            // tests are added, never lower it to get a build through.
            thresholds: { lines: 57, functions: 32, branches: 62, statements: 53 },
        },
    },
});

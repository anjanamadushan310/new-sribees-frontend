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
        // Page tests render real Ant Design screens in jsdom: seconds, not ms.
        testTimeout: 30000,
        // Sri Lanka time is the product's time; run the suite in a zone that is
        // NOT Colombo so a helper that leans on the machine's zone fails here.
        env: { TZ: 'America/New_York' },
        coverage: {
            provider: 'v8',
            reporter: ['text-summary', 'lcov', 'json-summary'],
            include: [
                'src/utils/**', 'src/hooks/**', 'src/store/**', 'src/api/client.ts', 'src/components/guards/**',
                // Pages with their own tests. Add a page here when it gets one.
                'src/pages/Auth/Login.tsx', 'src/pages/Customers/CustomerList.tsx',
                'src/pages/Orders/OrderList.tsx', 'src/pages/Marketing/CouponList.tsx',
            ],
            // Ratchets, set just under what the suite measures today: raise them
            // as tests are added, never lower them to get a build through. The
            // global figure counts every included file, pages too; the logic the
            // pages stand on keeps its own, higher bar.
            thresholds: {
                lines: 50, functions: 35, branches: 38, statements: 48,
                '{src/utils,src/hooks,src/store,src/components/guards}/**': {
                    lines: 59, functions: 38, branches: 65, statements: 56,
                },
                'src/pages/**': { lines: 40, functions: 30, branches: 25, statements: 39 },
            },
        },
    },
});

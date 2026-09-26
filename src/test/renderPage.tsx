/**
 * Render a page the way the app mounts it: Ant Design's App (for message and
 * modal), a fresh React Query client with no retries (a failed call shows
 * its error at once), and a router at the given path.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { App as AntApp } from 'antd';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

export function renderPage(page: ReactNode, { path = '/', route = '/' }: { path?: string; route?: string } = {}) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={client}>
            <AntApp>
                <MemoryRouter initialEntries={[route]}>
                    <Routes>
                        <Route path={path} element={page} />
                        <Route path="*" element={<p>elsewhere</p>} />
                    </Routes>
                </MemoryRouter>
            </AntApp>
        </QueryClientProvider>,
    );
}

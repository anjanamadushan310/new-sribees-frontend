import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AdminRole } from '../../types/admin.types';
import { signIn, signOut } from '../../test/users';
import { RoleGuard, SuperAdminOnly } from './RoleGuard';

afterEach(signOut);

function renderAt(element: ReactNode) {
    return render(
        <MemoryRouter initialEntries={['/secret']}>
            <Routes>
                <Route path="/secret" element={element} />
                <Route path="/login" element={<p>login page</p>} />
                <Route path="/" element={<p>home</p>} />
            </Routes>
        </MemoryRouter>,
    );
}

describe('RoleGuard', () => {
    it('sends a signed-out visitor to the login page', () => {
        renderAt(<RoleGuard><p>secret</p></RoleGuard>);
        expect(screen.getByText('login page')).toBeInTheDocument();
        expect(screen.queryByText('secret')).not.toBeInTheDocument();
    });

    it('keeps other roles out of Super-Admin-only screens', () => {
        signIn(AdminRole.BRANCH_MANAGER, { branch_id: 'colombo' });
        renderAt(<SuperAdminOnly><p>secret</p></SuperAdminOnly>);
        expect(screen.getByText('home')).toBeInTheDocument();
        expect(screen.queryByText('secret')).not.toBeInTheDocument();
    });

    it('lets the right role in', () => {
        signIn(AdminRole.SUPER_ADMIN);
        renderAt(<SuperAdminOnly><p>secret</p></SuperAdminOnly>);
        expect(screen.getByText('secret')).toBeInTheDocument();
    });

    it('checks a required permission, and shows the fallback when it is missing', () => {
        signIn(AdminRole.STAFF, { branch_id: 'c', permissions: [{ resource: 'orders', action: 'read' }] });
        renderAt(
            <RoleGuard requiredPermission={{ resource: 'products', action: 'update' }} fallback={<p>no access</p>}>
                <p>secret</p>
            </RoleGuard>,
        );
        expect(screen.getByText('no access')).toBeInTheDocument();
    });
});

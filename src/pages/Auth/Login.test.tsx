import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '../../api/auth.api';
import { useAuthStore } from '../../store/authStore';
import { renderPage } from '../../test/renderPage';
import { signOut } from '../../test/users';
import { AdminRole } from '../../types/admin.types';
import Login from './Login';

vi.mock('../../api/auth.api', () => ({ authApi: { login: vi.fn() } }));
const login = vi.mocked(authApi.login);

function fill(email: string, password: string) {
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: email } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: password } });
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));
}

describe('Login', () => {
    // Braces matter: a function returned from beforeEach is run as teardown,
    // and mockReset() returns the mock itself.
    beforeEach(() => {
        login.mockReset();
    });
    afterEach(signOut);

    it('signs in with a trimmed, lower-cased email and goes to the dashboard', async () => {
        login.mockResolvedValue({
            user: {
                admin_id: 'a1', email: 'boss@example.test', full_name: 'Boss',
                role: AdminRole.SUPER_ADMIN, permissions: [],
            },
            tokens: { accessToken: 'at', refreshToken: 'rt' },
            message: 'Welcome',
        } as Awaited<ReturnType<typeof authApi.login>>);
        renderPage(<Login />, { path: '/login', route: '/login' });

        fill('  Boss@Example.TEST ', 'pw');

        await waitFor(() => expect(login).toHaveBeenCalledWith({ email: 'boss@example.test', password: 'pw' }));
        await waitFor(() => expect(screen.getByText('elsewhere')).toBeInTheDocument());
        expect(useAuthStore.getState().isAuthenticated).toBe(true);
        expect(useAuthStore.getState().token).toBe('at');
    });

    it("shows the server's reason and stays signed out when the login is refused", async () => {
        // Shaped like an AxiosError: an Error carrying the server's response.
        const refused = Object.assign(new Error('401'), {
            response: { data: { detail: 'Invalid email or password' } },
        });
        login.mockImplementation(async () => {
            throw refused;
        });
        renderPage(<Login />, { path: '/login', route: '/login' });

        fill('boss@example.test', 'wrong');

        expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
        expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('asks for both fields before calling the server', async () => {
        renderPage(<Login />, { path: '/login', route: '/login' });
        fireEvent.click(screen.getByRole('button', { name: /log in/i }));
        expect(await screen.findByText('Please input your email!')).toBeInTheDocument();
        expect(screen.getByText('Please input your password!')).toBeInTheDocument();
        expect(login).not.toHaveBeenCalled();
    });
});

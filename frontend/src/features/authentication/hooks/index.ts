import { useState, useCallback } from 'react';
import { authApi, auth } from '../api';
import type { LoginCredentials, RegisterData, AuthUser } from '../types';
export function useAuth() {
    const [isAuthenticated, setIsAuthenticated] = useState(auth.isAuthenticated());
    const [user, setUser] = useState<AuthUser | null>(null);
    const login = useCallback(async (credentials: LoginCredentials) => {
        const response = await authApi.login(credentials.email, credentials.password);
        setIsAuthenticated(true);
        setUser(response.user);
        return response;
    }, []);
    const logout = useCallback(() => {
        auth.clearTokens();
        setIsAuthenticated(false);
        setUser(null);
    }, []);
    return {
        isAuthenticated,
        user,
        login,
        logout
    };
}
export function useLogin() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const login = useCallback(async (credentials: LoginCredentials) => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await authApi.login(credentials.email, credentials.password);
            return response;
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed');
            throw err;
        }
        finally {
            setIsLoading(false);
        }
    }, []);
    return { login, isLoading, error };
}
export function useRegister() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const register = useCallback(async (data: RegisterData) => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await authApi.register(data.name, data.email, data.password);
            return response;
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Registration failed');
            throw err;
        }
        finally {
            setIsLoading(false);
        }
    }, []);
    return { register, isLoading, error };
}

import { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { auth, userApi } from '../../shared/api/api';
interface AuthContextType {
    isAuthenticated: boolean;
    isAdmin: boolean;
    isLoading: boolean;
    localSessionId: string | undefined;
    login: (sessionId: string) => void;
    logout: () => void;
    setLocalSessionId: (sessionId: string | undefined) => void;
    setOnLogoutCallback: (callback: (() => void) | undefined) => void;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};
interface AuthProviderProps {
    children: ReactNode;
}
export function AuthProvider({ children }: AuthProviderProps) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [localSessionId, setLocalSessionId] = useState<string | undefined>(undefined);
    const onLogoutCallbackRef = useRef<(() => void) | undefined>(undefined);
    const checkAuthStatus = useCallback(async () => {
        setIsLoading(true);
        try {
            if (auth.isAuthenticated()) {
                setIsAuthenticated(true);
                try {
                    const userInfo = await userApi.getMe();
                    setIsAdmin(userInfo.is_superuser || userInfo.role === 'admin');
                }
                catch (error) {
                    console.error('Error getting user info:', error);
                    setIsAdmin(false);
                }
            }
            else {
                setIsAuthenticated(false);
                setIsAdmin(false);
            }
        }
        catch (error) {
            console.error('Error checking auth status:', error);
            setIsAuthenticated(false);
            setIsAdmin(false);
        }
        finally {
            setIsLoading(false);
        }
    }, []);
    const login = useCallback((sessionId: string) => {
        setLocalSessionId(sessionId);
        setIsAuthenticated(true);
        checkAuthStatus();
    }, [checkAuthStatus]);
    const setOnLogoutCallback = useCallback((callback: (() => void) | undefined) => {
        onLogoutCallbackRef.current = callback;
    }, []);
    const logout = useCallback(async () => {
        try {
            if (onLogoutCallbackRef.current) {
                onLogoutCallbackRef.current();
            }
            auth.clearTokens();
        }
        catch (error) {
            console.error('Error during logout:', error);
        }
        finally {
            setIsAuthenticated(false);
            setIsAdmin(false);
            setLocalSessionId(undefined);
        }
    }, []);
    useEffect(() => {
        checkAuthStatus();
    }, [checkAuthStatus]);
    return (<AuthContext.Provider value={{
            isAuthenticated,
            isAdmin,
            isLoading,
            localSessionId,
            login,
            logout,
            setLocalSessionId,
            setOnLogoutCallback
        }}>
      {children}
    </AuthContext.Provider>);
}

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { auth } from '../../shared/api/api';
import { externalTestsApi } from '../../shared/api/externalTests';

/**
 * Lands here from pk when an admin clicks "Создать тест". URL params:
 *   token    — JWT issued by pk (signed with PK_SSO_SECRET, sub=admin email)
 *   next     — path to navigate to after exchange (default: /admin/external-tests/new)
 *   callback — pk URL to return to after the admin saves the test in entest
 */
export const SsoFromPkPage = () => {
    const [params] = useSearchParams();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const token = params.get('token');
        const next = params.get('next') || '/admin/external-tests/new';
        const callback = params.get('callback') || '';

        if (!token) {
            setError('Отсутствует SSO токен');
            return;
        }

        (async () => {
            try {
                const data = await externalTestsApi.ssoExchange(token);
                auth.setTokens(data.access_token, data.access_token, data.token_type || 'Bearer');
                if (callback) {
                    sessionStorage.setItem('pk_callback_url', callback);
                }
                // Hard reload: AuthProvider only re-checks auth status on mount, so a SPA-level
                // navigate() would still see isAuthenticated=false and bounce us to the login page.
                window.location.replace(next);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'SSO failed';
                setError(msg);
            }
        })();
    }, []);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="bg-white p-8 rounded shadow max-w-md w-full">
                {error ? (
                    <div className="text-red-600">
                        <div className="font-semibold mb-2">Ошибка SSO</div>
                        <div className="text-sm">{error}</div>
                    </div>
                ) : (
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
                        <div>Авторизация...</div>
                    </div>
                )}
            </div>
        </div>
    );
};

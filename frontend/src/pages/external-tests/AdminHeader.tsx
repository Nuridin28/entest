import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers';

const linkClass = (active: boolean) =>
    `px-3 py-1.5 rounded-md text-sm font-medium transition ${
        active
            ? 'bg-blue-50 text-blue-700'
            : 'text-gray-700 hover:bg-gray-100'
    }`;

export const AdminHeader = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { logout } = useAuth();

    const isTestsRoute = location.pathname.startsWith('/admin/external-tests');
    const isHomeRoute = !isTestsRoute && (location.pathname === '/' || location.pathname.startsWith('/admin'));

    const handleHome = () => navigate('/');

    return (
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 md:px-8 h-14 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleHome}
                        className="font-bold text-gray-900 text-base hover:opacity-80 transition"
                    >
                        Admin · entest
                    </button>
                </div>
                <nav className="flex items-center gap-1 sm:gap-2">
                    <button onClick={handleHome} className={linkClass(isHomeRoute)}>
                        Главная
                    </button>
                    <button
                        onClick={() => navigate('/admin/external-tests')}
                        className={linkClass(isTestsRoute)}
                    >
                        Тесты
                    </button>
                    <button
                        onClick={logout}
                        className="ml-2 px-3 py-1.5 rounded-md text-sm font-medium text-red-600 hover:bg-red-50 transition"
                    >
                        Выйти
                    </button>
                </nav>
            </div>
        </header>
    );
};

import { useState, useEffect } from 'react';
import { adminApi } from '@shared/api/api';
import { useLoadingState } from '@shared/hooks/useLoadingState';
import UserAttempts from './UserAttempts';
import SystemMonitoring from './SystemMonitoring';
import PerformanceDashboard from './PerformanceDashboard';
import { ErrorBoundary } from '@shared/components';
import { t } from '@shared/utils/i18n';
interface User {
    id: number;
    full_name: string;
    email: string;
    is_superuser: boolean;
}
function AdminDashboard() {
    const [users, setUsers] = useState<User[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
    const [activeTab, setActiveTab] = useState<'users' | 'monitoring' | 'performance'>('users');
    const { isLoading, error, withLoading } = useLoadingState(true);
    useEffect(() => {
        if (selectedUserId === null) {
            const loadUsers = async () => {
                const userList = await withLoading(() => adminApi.getAllUsers());
                if (userList) {
                    setUsers(userList);
                }
            };
            loadUsers();
        }
    }, [selectedUserId, withLoading]);
    if (selectedUserId) {
        return (<UserAttempts userId={selectedUserId} onBack={() => setSelectedUserId(null)}/>);
    }
    if (isLoading) {
        return (<div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
      </div>);
    }
    if (error) {
        return <div className="text-red-500 p-8">{error}</div>;
    }
    return (<div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold mb-6">{t('adminDashboard')}</h1>

      
      <div className="mb-6">
        <nav className="flex space-x-8">
          <button onClick={() => setActiveTab('users')} className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'users'
            ? 'border-blue-500 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
            {t('users')} & Tests
          </button>
          <button onClick={() => setActiveTab('monitoring')} className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'monitoring'
            ? 'border-blue-500 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
            System Monitoring
          </button>
          <button onClick={() => setActiveTab('performance')} className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'performance'
            ? 'border-blue-500 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
            Performance
          </button>
        </nav>
      </div>

      
      {activeTab === 'users' && (<div className="bg-white shadow-md rounded-lg overflow-hidden">
          <table className="min-w-full leading-normal">
            <thead>
              <tr>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  {t('user')}
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  {t('role')}
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (<tr key={user.id}>
                  <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                    <div className="flex items-center">
                      <div className="ml-3">
                        <p className="text-gray-900 whitespace-no-wrap">{user.full_name}</p>
                        <p className="text-gray-600 whitespace-no-wrap">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                    <span className={`relative inline-block px-3 py-1 font-semibold leading-tight ${user.is_superuser
                    ? 'text-green-900 bg-green-200'
                    : 'text-gray-700 bg-gray-200'}`}>
                      <span className="relative">{user.is_superuser ? t('admin') : t('user')}</span>
                    </span>
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm text-right">
                    <button onClick={() => setSelectedUserId(user.id)} className="text-indigo-600 hover:text-indigo-900">
                      {t('viewAttempts')}
                    </button>
                  </td>
                </tr>))}
            </tbody>
          </table>
        </div>)}

      {activeTab === 'monitoring' && (<ErrorBoundary fallback={<div className="bg-red-50 border border-red-200 rounded-md p-4">
            <h3 className="text-red-800 font-medium">System Monitoring Error</h3>
            <p className="text-red-700 text-sm mt-1">
              Unable to load system monitoring data. Please refresh the page or contact support.
            </p>
          </div>}>
          <SystemMonitoring />
        </ErrorBoundary>)}

      {activeTab === 'performance' && <PerformanceDashboard />}
    </div>);
}
export default AdminDashboard;

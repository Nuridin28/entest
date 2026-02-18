import { useState, useEffect } from 'react';
import { adminApi } from '@shared/api/api';
import AttemptDetails from './AttemptDetails';
import { t } from '@shared/utils/i18n';
import { TimeDisplay, DurationDisplay } from '@shared/components/layout/TimeDisplay';
import { addToast } from '@shared/utils/toast';
interface TestAttempt {
    id: string;
    start_time: string;
    end_time?: string;
    status: string;
    cefr_level?: string;
    final_score?: number;
}
interface UserWithAttempts {
    id: number;
    full_name: string;
    email: string;
    test_sessions: TestAttempt[];
    test_attempts_used?: number;
    max_test_attempts?: number;
}
interface AttemptsInfo {
    user_id: number;
    user_name: string;
    user_email: string;
    attempts_used: number;
    max_attempts: number;
    remaining_attempts: number;
    can_start_test: boolean;
}
interface UserAttemptsProps {
    userId: number;
    onBack: () => void;
}
function UserAttempts({ userId, onBack }: UserAttemptsProps) {
    const [userData, setUserData] = useState<UserWithAttempts | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
    const [attemptsInfo, setAttemptsInfo] = useState<AttemptsInfo | null>(null);
    const [isResetting, setIsResetting] = useState(false);
    const [showResetModal, setShowResetModal] = useState(false);
    const [resetReason, setResetReason] = useState('');
    useEffect(() => {
        if (!selectedAttemptId) {
            const loadData = async () => {
                setIsLoading(true);
                try {
                    const [userData, attemptsInfo] = await Promise.all([
                        adminApi.getUserWithAttempts(userId),
                        adminApi.getUserAttemptsInfo(userId)
                    ]);
                    setUserData(userData);
                    setAttemptsInfo(attemptsInfo);
                }
                catch (err: any) {
                    setError('Failed to fetch user data.');
                    console.error(err);
                }
                finally {
                    setIsLoading(false);
                }
            };
            loadData();
        }
    }, [userId, selectedAttemptId]);
    const handleResetAttempts = async () => {
        if (!resetReason.trim()) {
            addToast({ type: 'error', message: 'Please provide a reason for resetting attempts' });
            return;
        }
        setIsResetting(true);
        try {
            await adminApi.resetUserAttempts(userId, resetReason);
            addToast({ type: 'success', message: 'User attempts reset successfully' });
            const [userData, attemptsInfo] = await Promise.all([
                adminApi.getUserWithAttempts(userId),
                adminApi.getUserAttemptsInfo(userId)
            ]);
            setUserData(userData);
            setAttemptsInfo(attemptsInfo);
            setShowResetModal(false);
            setResetReason('');
        }
        catch (err: any) {
            addToast({ type: 'error', message: 'Failed to reset attempts' });
            console.error(err);
        }
        finally {
            setIsResetting(false);
        }
    };
    if (selectedAttemptId) {
        return (<AttemptDetails attemptId={selectedAttemptId} onBack={() => setSelectedAttemptId(null)}/>);
    }
    if (isLoading) {
        return (<div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
      </div>);
    }
    if (error) {
        return <div className="text-red-500 p-8">{error}</div>;
    }
    if (!userData) {
        return <div className="p-8">User data not found.</div>;
    }
    return (<div className="p-4 md:p-8">
      <button onClick={onBack} className="mb-6 text-indigo-600 hover:text-indigo-900">
        &larr; {t('backToAllUsers')}
      </button>
      <h1 className="text-2xl font-bold mb-2">{userData.full_name}</h1>
      <p className="text-gray-600 mb-4">{userData.email}</p>

      
      {attemptsInfo && (<div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-semibold text-blue-800 mb-2">Test Attempts Information</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Used:</span>
              <span className="ml-2 font-semibold">{attemptsInfo.attempts_used}</span>
            </div>
            <div>
              <span className="text-gray-600">Max:</span>
              <span className="ml-2 font-semibold">{attemptsInfo.max_attempts}</span>
            </div>
            <div>
              <span className="text-gray-600">Remaining:</span>
              <span className="ml-2 font-semibold">{attemptsInfo.remaining_attempts}</span>
            </div>
            <div>
              <span className="text-gray-600">Can start test:</span>
              <span className={`ml-2 font-semibold ${attemptsInfo.can_start_test ? 'text-green-600' : 'text-red-600'}`}>
                {attemptsInfo.can_start_test ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
          <div className="mt-4">
            <button onClick={() => setShowResetModal(true)} disabled={isResetting} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50">
              Reset Attempts
            </button>
          </div>
        </div>)}

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <table className="min-w-full leading-normal">
          <thead>
            <tr>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                {t('sessionIdLabel')}
              </th>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                {t('date')}
              </th>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                {t('status')}
              </th>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                {t('score')}
              </th>
              <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100"></th>
            </tr>
          </thead>
          <tbody>
            {userData.test_sessions.map((attempt) => (<tr key={attempt.id}>
                <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                  <p className="text-gray-900 whitespace-no-wrap font-mono text-xs">{attempt.id}</p>
                </td>
                <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                  <div className="text-gray-900">
                    <TimeDisplay date={attempt.start_time} format="short" className="block"/>
                    {attempt.end_time && (<DurationDisplay startTime={attempt.start_time} endTime={attempt.end_time} className="text-xs text-gray-500 mt-1" label=""/>)}
                  </div>
                </td>
                <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                  <span className={`relative inline-block px-3 py-1 font-semibold leading-tight ${attempt.status === 'completed'
                ? 'text-green-900 bg-green-200'
                : attempt.status === 'invalidated'
                    ? 'text-red-900 bg-red-200'
                    : attempt.status.includes('in_progress')
                        ? 'text-yellow-900 bg-yellow-200'
                        : 'text-gray-900 bg-gray-200'}`}>
                    <span className="relative">
                      {attempt.status === 'invalidated' ? t('annulled') : attempt.status}
                    </span>
                  </span>
                </td>
                <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                  <p className="text-gray-900 whitespace-no-wrap">{attempt.final_score || 'N/A'}</p>
                </td>
                <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm text-right">
                  <button onClick={() => setSelectedAttemptId(attempt.id)} className="text-indigo-600 hover:text-indigo-900">
                    {t('viewDetails')}
                  </button>
                </td>
              </tr>))}
          </tbody>
        </table>
      </div>

      
      {showResetModal && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Reset User Attempts</h3>
            <p className="text-gray-600 mb-4">
              This will reset the user's test attempts to 0. Please provide a reason for this action.
            </p>
            <textarea value={resetReason} onChange={(e) => setResetReason(e.target.value)} placeholder="Enter reason for resetting attempts..." className="w-full p-3 border border-gray-300 rounded-lg resize-none h-24 mb-4" required/>
            <div className="flex justify-end space-x-3">
              <button onClick={() => {
                setShowResetModal(false);
                setResetReason('');
            }} className="px-4 py-2 text-gray-600 hover:text-gray-800" disabled={isResetting}>
                Cancel
              </button>
              <button onClick={handleResetAttempts} disabled={isResetting || !resetReason.trim()} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded disabled:opacity-50">
                {isResetting ? 'Resetting...' : 'Reset Attempts'}
              </button>
            </div>
          </div>
        </div>)}
    </div>);
}
export default UserAttempts;

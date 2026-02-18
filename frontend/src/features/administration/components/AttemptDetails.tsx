import { useState, useEffect } from 'react';
import { adminApi } from '@shared/api/api';
import { addToast } from '@shared/utils/toast';
import { t } from '@shared/utils/i18n';
import { formatAlmatyTimeShort } from '@shared/utils/timezone';
interface ProctoringViolation {
    id: number;
    timestamp: string;
    violation_type: string;
    violation_metadata?: object;
}
interface QuestionDetail {
    id: number;
    question_type: string;
    content?: any;
    options?: any;
    correct_answer?: string;
    user_answer?: string;
    score?: number;
    feedback?: string;
}
interface AttemptDetails {
    id: string;
    start_time: string;
    end_time?: string;
    status: string;
    initial_photo_path?: string;
    screen_recording_path?: string;
    violations: ProctoringViolation[];
    questions: QuestionDetail[];
    cefr_level?: string;
    reading_score?: number;
    listening_score?: number;
    writing_score?: number;
    speaking_score?: number;
    final_score?: number;
    is_invalidated?: boolean;
    invalidation_reason?: string;
}
interface AttemptDetailsProps {
    attemptId: string;
    onBack: () => void;
}
function AttemptDetails({ attemptId, onBack }: AttemptDetailsProps) {
    const [details, setDetails] = useState<AttemptDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [isInvalidating, setIsInvalidating] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [invalidationReason, setInvalidationReason] = useState('');
    const [showInvalidationDialog, setShowInvalidationDialog] = useState(false);
    useEffect(() => {
        const loadDetails = async () => {
            try {
                const data = await adminApi.getAttemptDetails(attemptId);
                setDetails(data);
            }
            catch (err) {
                setError('Failed to fetch attempt details.');
                console.error(err);
            }
            finally {
                setIsLoading(false);
            }
        };
        loadDetails();
    }, [attemptId]);
    const handleInvalidateAttempt = async () => {
        if (!invalidationReason.trim()) {
            addToast({ type: 'error', message: t('provideInvalidationReason') });
            return;
        }
        setIsInvalidating(true);
        try {
            await adminApi.invalidateAttempt(attemptId, invalidationReason);
            addToast({ type: 'success', message: t('testInvalidatedSuccess') });
            setShowInvalidationDialog(false);
            setInvalidationReason('');
            const data = await adminApi.getAttemptDetails(attemptId);
            setDetails(data);
        }
        catch (err) {
            addToast({ type: 'error', message: t('testInvalidationError') });
            console.error(err);
        }
        finally {
            setIsInvalidating(false);
        }
    };
    const handleValidateAttempt = async () => {
        setIsValidating(true);
        try {
            await adminApi.validateAttempt(attemptId);
            addToast({ type: 'success', message: t('testValidatedSuccess') });
            const data = await adminApi.getAttemptDetails(attemptId);
            setDetails(data);
        }
        catch (err) {
            addToast({ type: 'error', message: t('testValidationError') });
            console.error(err);
        }
        finally {
            setIsValidating(false);
        }
    };
    const formatDuration = (startTime: string, endTime?: string) => {
        if (!endTime) {
            if (details?.status === 'ai_test_generating') {
                return 'ИИ тест генерируется';
            }
            else if (details?.status === 'preliminary_in_progress') {
                return 'Предварительный тест в процессе';
            }
            else if (details?.status === 'main_test_in_progress') {
                return 'Основной тест в процессе';
            }
            return t('inProgress');
        }
        const start = new Date(startTime);
        const end = new Date(endTime);
        const diffMs = end.getTime() - start.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        return `${diffMins} ${t('minutes')}`;
    };
    const getViolationSeverityColor = (violationType: string) => {
        const highSeverity = ['tab_switched_away', 'devtools_opened', 'screen_share_stopped', 'multiple_faces_detected'];
        const mediumSeverity = ['window_lost_focus', 'no_face_detected', 'fullscreen_exited'];
        if (highSeverity.includes(violationType))
            return 'text-red-600 bg-red-100';
        if (mediumSeverity.includes(violationType))
            return 'text-yellow-600 bg-yellow-100';
        return 'text-blue-600 bg-blue-100';
    };
    const getViolationDisplayName = (violationType: string) => {
        const violationNames: Record<string, string> = {
            'tab_switched_away': t('tabSwitched'),
            'window_lost_focus': t('windowLostFocus'),
            'devtools_opened': t('devtoolsOpened'),
            'screen_share_stopped': t('screenShareStopped'),
            'no_face_detected': t('noFaceDetected'),
            'multiple_faces_detected': t('multipleFacesDetected'),
            'fullscreen_exited': t('fullscreenExited'),
            'head_turned_significantly': t('headTurnedSignificantly'),
            'looking_away_from_screen': t('lookingAwayFromScreen'),
            'suspicious_hotkey': t('suspiciousHotkey'),
        };
        return violationNames[violationType] || violationType;
    };
    if (isLoading) {
        return (<div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
      </div>);
    }
    if (error) {
        return <div className="p-8 text-red-500">{error}</div>;
    }
    if (!details) {
        return <div className="p-8">Attempt details not found.</div>;
    }
    const getMediaUrl = (fileType: 'photo' | 'screen') => {
        const token = adminApi.getAccessToken();
        if (!token) {
            console.error("No auth token found for media URL");
            return '';
        }
        return `${import.meta.env.VITE_API_URL || ''}/api/v1/admin/media/${attemptId}/${fileType}?token=${token}`;
    };
    const downloadMedia = (fileType: 'photo' | 'screen') => {
        const url = getMediaUrl(fileType);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${attemptId}_${fileType}.${fileType === 'photo' ? 'png' : 'webm'}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    return (<div className="p-4 md:p-8">
      <button onClick={onBack} className="mb-6 text-indigo-600 hover:text-indigo-900">
        &larr; {t('backToAttempts')}
      </button>
      
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold mb-2">{t('testDetailsTitle')}</h1>
          <p className="text-gray-500 font-mono text-sm mb-2">ID: {details.id}</p>
          <p className="text-gray-600">
            {t('testTime')}: {formatAlmatyTimeShort(details.start_time)} - {formatDuration(details.start_time, details.end_time)}
          </p>
        </div>
        
        <div className="flex space-x-2">
          {details.is_invalidated ? (<div className="text-center">
              <span className="inline-block px-3 py-1 text-red-700 bg-red-100 rounded-full text-sm font-medium mb-2">
                {t('annulled')}
              </span>
              {details.invalidation_reason && (<p className="text-sm text-gray-600">{t('reason', { reason: details.invalidation_reason })}</p>)}
              <button onClick={handleValidateAttempt} disabled={isValidating} className="mt-2 bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 disabled:opacity-50">
                {isValidating ? t('validating') : t('validateTest')}
              </button>
            </div>) : (<button onClick={() => setShowInvalidationDialog(true)} className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600">
              {t('invalidateTest')}
            </button>)}
        </div>
      </div>

      
      
      {(details.reading_score !== null || details.listening_score !== null ||
            details.writing_score !== null || details.speaking_score !== null) && (<div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">{t('sectionResults')}</h2>
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{details.reading_score || 'N/A'}</div>
                <div className="text-sm text-gray-600">{t('reading')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{details.listening_score || 'N/A'}</div>
                <div className="text-sm text-gray-600">{t('listening')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{details.writing_score || 'N/A'}</div>
                <div className="text-sm text-gray-600">{t('writing')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{details.speaking_score || 'N/A'}</div>
                <div className="text-sm text-gray-600">{t('speaking')}</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-indigo-600">{details.final_score || 'N/A'}</div>
                <div className="text-sm text-gray-600">{t('overallScore')}</div>
              </div>
            </div>
            {details.cefr_level && (<div className="text-center">
                <span className="inline-block px-4 py-2 bg-indigo-100 text-indigo-800 rounded-full font-semibold">
                  {t('level')} {details.cefr_level}
                </span>
              </div>)}
          </div>
        </div>)}

      
      {(!details.reading_score && !details.listening_score &&
            !details.writing_score && !details.speaking_score && details.final_score) && (<div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Результаты предварительного теста</h2>
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="text-center mb-4">
              <div className="text-4xl font-bold text-indigo-600 mb-2">{Math.round(details.final_score)}%</div>
              <div className="text-lg text-gray-600">Общий результат</div>
            </div>
            {details.cefr_level && (<div className="text-center">
                <span className="inline-block px-4 py-2 bg-indigo-100 text-indigo-800 rounded-full font-semibold">
                  Определенный уровень: {details.cefr_level}
                </span>
              </div>)}
          </div>
        </div>)}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <div className="lg:col-span-2 space-y-8">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Запись экрана</h2>
              {details.screen_recording_path && (<button onClick={() => {
                try {
                    downloadMedia('screen');
                }
                catch (error) {
                    console.error('Download error:', error);
                    alert('Ошибка скачивания: файл не найден');
                }
            }} className="text-blue-600 hover:text-blue-800 text-sm flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                  </svg>
                  Скачать запись экрана
                </button>)}
            </div>
            {details.screen_recording_path ? (<div>
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-lg font-semibold">Запись экрана</h4>
                  <a href={`${getMediaUrl('screen')}&download=true`} download={`screen_recording_${attemptId}.webm`} className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors">
                    📥 Скачать
                  </a>
                </div>
                <video src={getMediaUrl('screen')} controls className="w-full rounded-lg shadow-md bg-gray-900" onError={(e) => {
                console.error('Video loading error:', e);
                console.log('Video URL:', getMediaUrl('screen'));
                console.log('Screen recording path:', details.screen_recording_path);
                const target = e.target as HTMLVideoElement;
                target.style.display = 'none';
                const existingError = target.parentNode?.querySelector('.video-error-message');
                if (existingError) {
                    existingError.remove();
                }
                const errorDiv = document.createElement('div');
                errorDiv.className = 'video-error-message p-8 text-center bg-red-100 text-red-600 rounded-lg mt-4';
                errorDiv.innerHTML = `
                      <div class="mb-2">❌ Ошибка загрузки записи экрана</div>
                      <div class="text-sm text-gray-600">
                        <div>Путь в БД: ${details.screen_recording_path}</div>
                        <div>URL: ${getMediaUrl('screen')}</div>
                      </div>
                    `;
                target.parentNode?.appendChild(errorDiv);
            }} onLoadStart={() => {
                console.log('Video loading started for:', getMediaUrl('screen'));
            }} onCanPlay={() => {
                console.log('Video can play:', getMediaUrl('screen'));
            }}/>
                <div className="mt-2 text-xs text-gray-500">
                  Путь: {details.screen_recording_path}
                </div>
              </div>) : (<div className="p-8 text-center bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="mb-2">📹 Запись экрана недоступна</div>
                <div className="text-sm text-gray-600 mb-3">
                  Путь к записи не сохранен в базе данных
                </div>
                <div className="text-xs text-gray-500 mb-3 bg-gray-50 p-2 rounded">
                  <strong>Возможные причины:</strong><br />
                  • Пользователь отклонил разрешение на запись экрана<br />
                  • Сбой сети во время загрузки записи<br />
                  • Тест был прерван до завершения записи<br />
                  • Техническая ошибка в процессе записи
                </div>
                <div className="mt-2">
                  <button onClick={async () => {
                try {
                    const response = await fetch(`/api/v1/admin/media/${attemptId}/screen?token=${adminApi.getAccessToken()}`);
                    if (response.ok) {
                        alert('Запись экрана найдена и восстановлена!');
                        window.location.reload();
                    }
                    else {
                        const errorData = await response.json().catch(() => ({}));
                        if (errorData.detail?.error === 'screen_recording_not_found') {
                            alert('Запись экрана действительно отсутствует. ' + errorData.detail.details);
                        }
                        else {
                            alert('Запись экрана не найдена');
                        }
                    }
                }
                catch (error) {
                    console.error('Error checking screen recording:', error);
                    alert('Ошибка при проверке записи экрана');
                }
            }} className="px-3 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600">
                    Попробовать найти
                  </button>
                </div>
              </div>)}
          </div>
          

          

        </div>

        
        <div className="lg:col-span-1">
          <h2 className="text-xl font-semibold mb-4">{t('proctoringLogs')}</h2>
          <div className="bg-white rounded-lg shadow-md p-4 space-y-4 max-h-[600px] overflow-y-auto">
            <div className="flex justify-between text-sm font-medium">
              <span>{t('totalEvents')} {details.violations.length}</span>
              <span className="text-red-600">{t('critical')} {details.violations.filter(log => ['devtools_opened', 'tab_switched_away', 'screen_share_stopped', 'multiple_faces_detected'].includes(log.violation_type)).length}</span>
              <span className="text-orange-600">{t('highRiskLabel')} {details.violations.filter(log => ['window_lost_focus', 'no_face_detected', 'suspicious_hotkey'].includes(log.violation_type)).length}</span>
            </div>
            
            <div className="space-y-3">
              {!details.violations.length ? (<div className="text-center text-gray-500 py-4">{t('proctoringEventsNotRecorded')}</div>) : (details.violations.map((log: ProctoringViolation) => {
            return (<div key={log.id} className={`p-3 rounded-lg text-xs ${getViolationSeverityColor(log.violation_type)}`}>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold">{getViolationDisplayName(log.violation_type)}</span>
                        <span className="text-gray-700">{new Date(log.timestamp).toLocaleTimeString()}</span>
                      </div>
                      {log.violation_metadata && (<div className="mt-1 text-gray-600 text-xs">
                          <pre className="whitespace-pre-wrap font-sans">
                            {JSON.stringify(log.violation_metadata, null, 2)}
                          </pre>
                        </div>)}
                    </div>);
        }))}
            </div>

            <div className="border-t pt-4 mt-4">
              <h3 className="text-md font-semibold mb-2">{t('technicalDetails')}</h3>
              <div className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                {JSON.stringify(details.violations, null, 2)}
              </div>
            </div>
          </div>
        </div>
      </div>

      
      {details.questions && details.questions.length > 0 &&
            (details.reading_score !== null || details.listening_score !== null ||
                details.writing_score !== null || details.speaking_score !== null) && (<div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">{t('detailedTestResults')}</h2>
          <div className="space-y-6">
            {['reading', 'listening', 'writing', 'speaking'].map(section => {
                const sectionQuestions = details.questions.filter(q => q.question_type === section);
                if (sectionQuestions.length === 0)
                    return null;
                const sectionNames = {
                    reading: t('reading'),
                    listening: t('listening'),
                    writing: t('writing'),
                    speaking: t('speaking')
                };
                return (<div key={section} className="bg-white rounded-lg shadow-md p-6">
                  <h3 className="text-lg font-semibold mb-4 text-blue-600">
                    {sectionNames[section as keyof typeof sectionNames]} {t('questionsCount', { count: sectionQuestions.length })}
                  </h3>
                  
                  <div className="space-y-4">
                    {sectionQuestions.map((question, index) => (<div key={question.id} className="border-l-4 border-blue-200 pl-4 py-2">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-medium text-gray-800">
                            {t('questionLabel')} {index + 1}
                          </h4>
                          <div className="flex items-center space-x-2">
                            {question.score !== null && question.score !== undefined && (<span className={`px-2 py-1 rounded text-sm font-medium ${question.score >= 0.8 ? 'bg-green-100 text-green-800' :
                                question.score >= 0.6 ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-red-100 text-red-800'}`}>
                                {Math.round(question.score * 100)}%
                              </span>)}
                          </div>
                        </div>

                        
                        {question.content && (<div className="mb-3">
                            <p className="text-sm text-gray-600 mb-1">{t('questionContent')}</p>
                            <div className="bg-gray-50 p-3 rounded text-sm">
                              {section === 'reading' && question.content.question}
                              {section === 'listening' && question.content.question}
                              {section === 'writing' && (<div>
                                  <p className="font-medium">{question.content.title}</p>
                                  <p className="mt-1">{question.content.prompt}</p>
                                </div>)}
                              {section === 'speaking' && question.content.question}
                            </div>
                          </div>)}

                        
                        {question.options && Object.keys(question.options).length > 0 && (<div className="mb-3">
                            <p className="text-sm text-gray-600 mb-1">{t('answerOptions')}</p>
                            <div className="bg-gray-50 p-3 rounded text-sm">
                              {Object.entries(question.options).map(([key, value]) => (<div key={key} className={`py-1 ${question.correct_answer === key ? 'text-green-600 font-medium' : ''}`}>
                                  {key}. {value as string}
                                  {question.correct_answer === key && ' ✓'}
                                </div>))}
                            </div>
                          </div>)}

                        
                        {question.user_answer && (<div className="mb-3">
                            <p className="text-sm text-gray-600 mb-1">{t('studentAnswer')}</p>
                            <div className="bg-blue-50 p-3 rounded text-sm">
                              {section === 'writing' || section === 'speaking' ? (<div className="whitespace-pre-wrap">{question.user_answer}</div>) : (<span className={`font-medium ${question.user_answer === question.correct_answer ?
                                    'text-green-600' : 'text-red-600'}`}>
                                  {question.user_answer}
                                  {question.user_answer === question.correct_answer ? ' ✓' : ' ✗'}
                                </span>)}
                            </div>
                          </div>)}

                        
                        {question.correct_answer && section !== 'writing' && section !== 'speaking' && (<div className="mb-3">
                            <p className="text-sm text-gray-600 mb-1">{t('correctAnswer')}</p>
                            <div className="bg-green-50 p-3 rounded text-sm text-green-800 font-medium">
                              {question.correct_answer}
                            </div>
                          </div>)}

                        
                        {question.feedback && (<div className="mb-3">
                            <p className="text-sm text-gray-600 mb-1">{t('feedback')}</p>
                            <div className="bg-purple-50 p-3 rounded text-sm">
                              {typeof question.feedback === 'string' ? (question.feedback) : (<pre className="whitespace-pre-wrap text-xs">
                                  {JSON.stringify(question.feedback, null, 2)}
                                </pre>)}
                            </div>
                          </div>)}
                      </div>))}
                  </div>
                </div>);
            })}
          </div>
        </div>)}

      
      {showInvalidationDialog && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">{t('invalidateTestTitle')}</h3>
            <p className="text-gray-600 mb-4">
              {t('invalidationReasonPrompt')}
            </p>
            <textarea value={invalidationReason} onChange={(e) => setInvalidationReason(e.target.value)} placeholder={t('invalidationReasonPlaceholder')} className="w-full p-3 border rounded-lg mb-4" rows={3}/>
            <div className="flex justify-end space-x-2">
              <button onClick={() => {
                setShowInvalidationDialog(false);
                setInvalidationReason('');
            }} className="px-4 py-2 text-gray-600 bg-gray-200 rounded-lg hover:bg-gray-300">
                {t('cancel')}
              </button>
              <button onClick={handleInvalidateAttempt} disabled={isInvalidating} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50">
                {isInvalidating ? t('invalidating') : t('invalidateTest')}
              </button>
            </div>
          </div>
        </div>)}
    </div>);
}
export default AttemptDetails;

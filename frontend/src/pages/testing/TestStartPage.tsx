import { useState, useEffect } from 'react';
import { auth, preliminaryTestApi } from '../../shared/api/api';
import { type ProctoringState, type ScreenState, type AudioState } from '../../shared/utils/proctoring';
import { addToast } from '../../shared/utils/toast';
import { withErrorHandling } from '../../shared/utils/errorHandler';
import { t } from '../../shared/utils/i18n';
import { AlmatyTimeClock } from '../../shared/components/layout';
interface TestStartPageProps {
    onLogout: () => void;
    onStartTest: () => void;
    proctoringState: ProctoringState;
    screenState: ScreenState;
    audioState: AudioState;
    requestCameraStream: () => Promise<MediaStream | null>;
    requestScreenStream: () => Promise<MediaStream | null>;
    startMonitoring: (cameraStream: MediaStream, screenStream: MediaStream) => void;
    proctoringCameraStream: MediaStream | null;
    onVideoMetadataLoaded: () => void;
    logCheatingEvent: (type: string, metadata?: object) => void;
    isTestActive: boolean;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
}
function TestStartPage({ onLogout, onStartTest, proctoringState, screenState, requestCameraStream, requestScreenStream, startMonitoring, proctoringCameraStream, videoRef, }: TestStartPageProps) {
    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);
    const [isCameraRequesting, setIsCameraRequesting] = useState(false);
    const [isScreenRequesting, setIsScreenRequesting] = useState(false);
    const [needsLogout, setNeedsLogout] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [attemptsInfo, setAttemptsInfo] = useState<{
        can_start: boolean;
        attempts_used: number;
        max_attempts: number;
        remaining_attempts: number;
        reason?: string;
    } | null>(null);
    const [isLoadingAttempts, setIsLoadingAttempts] = useState(true);
    useEffect(() => {
        console.log('TestStartPage: Connecting camera stream to video element', {
            cameraEnabled: proctoringState.cameraEnabled,
            cameraStream: !!proctoringCameraStream,
            videoElement: !!videoRef.current
        });
        if (proctoringState.cameraEnabled && proctoringCameraStream && videoRef.current) {
            if (videoRef.current.srcObject !== proctoringCameraStream) {
                console.log('TestStartPage: Setting camera stream to preview video element');
                videoRef.current.srcObject = proctoringCameraStream;
                videoRef.current.play().then(() => {
                    console.log('TestStartPage: Preview video started playing successfully');
                }).catch(error => {
                    console.error('TestStartPage: Error playing preview video:', error);
                });
            }
        }
    }, [proctoringState.cameraEnabled, proctoringCameraStream, videoRef]);
    useEffect(() => {
        if (needsLogout) {
            onLogout();
        }
    }, [needsLogout, onLogout]);
    useEffect(() => {
        const checkAttempts = async () => {
            if (!auth.isAuthenticated()) {
                setNeedsLogout(true);
                return;
            }
            try {
                setIsLoadingAttempts(true);
                const attempts = await preliminaryTestApi.checkAttempts();
                setAttemptsInfo(attempts);
                if (!attempts.can_start) {
                    setIsError(true);
                    setMessage(t('maxAttemptsExceeded', {
                        used: attempts.attempts_used,
                        max: attempts.max_attempts
                    }));
                }
            }
            catch (error) {
                console.error('Error checking attempts:', error);
                setIsError(true);
                setMessage(t('errorCheckingAttempts'));
            }
            finally {
                setIsLoadingAttempts(false);
            }
        };
        checkAttempts();
    }, []);
    useEffect(() => {
        if (proctoringState.error?.includes('Permission denied') || screenState.error?.includes('Permission denied')) {
            addToast({ type: 'error', message: t('permissionDeniedError') });
            setNeedsLogout(true);
        }
    }, [proctoringState.error, screenState.error]);
    const handleRequestCamera = async () => {
        setIsCameraRequesting(true);
        await requestCameraStream();
        setIsCameraRequesting(false);
    };
    const handleRequestScreen = async () => {
        setIsScreenRequesting(true);
        await requestScreenStream();
        setIsScreenRequesting(false);
    };
    async function handleStartTest(event: React.FormEvent) {
        event.preventDefault();
        setMessage('');
        setIsError(false);
        setIsStarting(true);
        if (!auth.isAuthenticated()) {
            setIsError(true);
            addToast({ type: 'error', message: t('authTokenNotFound') });
            setIsStarting(false);
            return;
        }
        if (!attemptsInfo?.can_start) {
            setIsError(true);
            addToast({ type: 'error', message: t('maxAttemptsExceeded', {
                    used: attemptsInfo?.attempts_used || 0,
                    max: attemptsInfo?.max_attempts || 3
                }) });
            setIsStarting(false);
            return;
        }
        if (!cameraReady || !screenReady || !proctoringCameraStream || !screenState.stream) {
            addToast({ type: 'error', message: t('allowCameraScreenAccess') });
            setIsStarting(false);
            return;
        }
        await withErrorHandling(async () => {
            startMonitoring(proctoringCameraStream!, screenState.stream!);
            onStartTest();
        }, 'start test', (error) => {
            setIsError(true);
            if (error.message?.includes('401') || error.message?.includes('credentials')) {
                auth.clearTokens();
                setNeedsLogout(true);
            }
            else if (error.message?.includes('Maximum test attempts exceeded')) {
                preliminaryTestApi.checkAttempts().then(setAttemptsInfo).catch(console.error);
            }
        });
        setIsStarting(false);
    }
    const cameraReady = proctoringState.cameraEnabled && proctoringCameraStream && !proctoringState.error;
    const screenReady = screenState.isScreenShared && !screenState.error;
    return (<div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
        <div className="flex justify-center mb-6">
          <img src="/kbtu-logo.svg" alt="KBTU Logo" className="h-20"/>
        </div>

        <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">{t('startTest')}</h2>

        
        {isLoadingAttempts ? (<div className="mb-6 p-4 bg-blue-50 rounded-lg text-center">
            <p className="text-blue-700">{t('checkingAttempts')}</p>
          </div>) : attemptsInfo && (<div className={`mb-6 p-4 rounded-lg ${attemptsInfo.can_start ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="text-center">
              <p className={`font-semibold ${attemptsInfo.can_start ? 'text-green-700' : 'text-red-700'}`}>
                {t('attemptsInfo', {
                used: attemptsInfo.attempts_used,
                max: attemptsInfo.max_attempts,
                remaining: attemptsInfo.remaining_attempts
            })}
              </p>
              {!attemptsInfo.can_start && (<p className="text-red-600 mt-2 font-medium">
                  {t('noAttemptsRemaining')}
                </p>)}
            </div>
          </div>)}

        <div className="mb-6 text-gray-700 leading-relaxed">
          <p className="mb-2 font-semibold">{t('welcomeMessage')}</p>
          <p className="mb-2">{t('rulesHeader')}</p>
          <ul className="list-disc list-inside space-y-1">
            <li>{t('rule1')}</li>
            <li>{t('rule2')}</li>
            <li>{t('rule3')}</li>
            <li>{t('rule4')}</li>
            <li>{t('rule5')}</li>
          </ul>
          <p className="mt-4 font-semibold text-red-600">{t('rulesViolationWarning')}</p>
        </div>

        {message && (<div className={`mb-4 p-3 rounded-md text-center ${isError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {message}
          </div>)}

        <div className="mb-6">
          <p className="text-lg font-semibold text-gray-800 mb-4">{t('cameraScreenCheck')}</p>
          <p className="text-gray-600 mb-4">{t('cameraScreenAccessPermission')}</p>
          
          <div className="flex justify-center mb-4 relative">
            <video ref={videoRef} autoPlay muted playsInline className={`w-full max-w-xs rounded-lg ${cameraReady ? 'border-2 border-green-500' : 'border-2 border-gray-300 opacity-40'}`}/>

            {(!cameraReady || !screenReady) && (<div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 pointer-events-none">
                {!proctoringState.modelsLoaded ? t('loadingModels') : t('waitingAccess')}
              </div>)}
          </div>

          <p className="text-center text-sm text-gray-500 mt-2">
            {cameraReady ? t('cameraActive') : (proctoringState.error ? t('cameraError', { error: proctoringState.error }) : t('waitingCamera'))}
          </p>
          <p className="text-center text-sm text-gray-500">
            {screenReady ? t('screenActive') : (screenState.error ? t('screenError', { error: screenState.error }) : t('waitingScreen'))}
          </p>
        </div>

        
        <div className="grid grid-cols-1 gap-3 mb-6">
          <button type="button" onClick={handleRequestCamera} disabled={cameraReady || isCameraRequesting} className={`py-2 px-3 sm:px-4 rounded-full font-bold focus:outline-none focus:shadow-outline text-sm sm:text-base min-w-0 ${cameraReady ? 'bg-green-500 text-white cursor-default' : 'bg-blue-500 hover:bg-blue-700 text-white'} ${isCameraRequesting && 'opacity-50 cursor-wait'}`}>
            <span className="truncate">
              {cameraReady ? t('cameraReady') : t('allowCamera')}
            </span>
          </button>

          <button type="button" onClick={handleRequestScreen} disabled={screenReady || isScreenRequesting} className={`py-2 px-3 sm:px-4 rounded-full font-bold focus:outline-none focus:shadow-outline text-sm sm:text-base min-w-0 ${screenReady ? 'bg-green-500 text-white cursor-default' : 'bg-blue-500 hover:bg-blue-700 text-white'} ${isScreenRequesting && 'opacity-50 cursor-wait'}`}>
            <span className="truncate">
              {screenReady ? t('screenReady') : t('allowScreen')}
            </span>
          </button>
        </div>

        <form onSubmit={handleStartTest}>
          <div className="flex items-center justify-center">
            <button type="submit" disabled={!cameraReady || !screenReady || isStarting || isLoadingAttempts || !attemptsInfo?.can_start} className={`bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 sm:py-3 px-4 sm:px-6 rounded-full focus:outline-none focus:shadow-outline w-full text-sm sm:text-base min-w-0 ${(!cameraReady || !screenReady || isStarting || isLoadingAttempts || !attemptsInfo?.can_start) && 'opacity-50 cursor-not-allowed'}`}>
              <span className="truncate">
                {isLoadingAttempts ? t('checkingAttempts') :
            !attemptsInfo?.can_start ? t('noAttemptsRemaining') :
                isStarting ? t('startingTest') : t('startTest')}
              </span>
            </button>
          </div>
        </form>

        
        <div className="mt-4 text-center space-y-2">
          <AlmatyTimeClock className="justify-center"/>
          <button onClick={() => {
            console.log('Logout button clicked');
            auth.clearTokens();
            onLogout();
        }} className="text-sm text-gray-500 hover:text-gray-700 underline">
            {t('logout')}
          </button>
        </div>
      </div>
    </div>);
}
export default TestStartPage;

import { useAuth } from '../providers';
import { AuthPage } from '../../pages/authentication';
import { TestStartPage, type TestLanguage } from '../../pages/testing';
import { AdminPage } from '../../pages/administration';
import UnifiedTestInterface from '../../widgets/UnifiedTestInterface';
import { useProctoring } from '../../shared/utils/proctoring';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SsoFromPkPage } from '../../pages/sso-from-pk';
import { TakePage } from '../../pages/take';
import { ExternalTestsListPage } from '../../pages/external-tests/ListPage';
import { ExternalTestEditorPage } from '../../pages/external-tests/EditorPage';

export const AppRouter = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { isAuthenticated, isAdmin, logout, setOnLogoutCallback } = useAuth();
    const [isTestActive, setIsTestActive] = useState(false);
    const [testStage, setTestStage] = useState<'start' | 'preliminary' | 'main'>('start');
    const [selectedTestLanguage, setSelectedTestLanguage] = useState<TestLanguage>('en');
    const [testStartKey, setTestStartKey] = useState(0);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { proctoringState, screenState, audioState, stopProctoringSession, pauseProctoringSession, pauseProctoringSessionKeepRecording, resumeProctoringMonitoring, resetForNewTest, requestCameraStream, requestScreenStream, startMonitoring, cameraStream: proctoringCameraStream, onVideoMetadataLoaded, logCheatingEvent, requestFullscreenProgrammatically, saveCurrentRecording, saveFinalRecording, setTransitionState, } = useProctoring(isTestActive, videoRef, canvasRef);
    useEffect(() => {
        setOnLogoutCallback(() => stopProctoringSession);
    }, [stopProctoringSession, setOnLogoutCallback]);
    const handleLoginSuccess = useCallback(() => {
        window.location.reload();
    }, [navigate]);
    const handleLogout = useCallback(() => {
        logout();
    }, [logout]);
    const handleStartPreliminaryTest = useCallback((language: TestLanguage) => {
        setSelectedTestLanguage(language);
        setTestStage('preliminary');
        setIsTestActive(true);
        if (!proctoringCameraStream) {
            requestCameraStream();
        }
    }, [proctoringCameraStream, requestCameraStream]);
    const handleTestComplete = useCallback(() => {
        setIsTestActive(false);
        setTestStage('start');
        pauseProctoringSession();
        resetForNewTest();
        setTestStartKey(prev => prev + 1);
    }, [pauseProctoringSession, resetForNewTest]);
    // Standalone pages that bypass the proctoring/auth wrapper of the legacy app.
    if (location.pathname.startsWith('/sso/from-pk')) {
        return <SsoFromPkPage />;
    }
    if (location.pathname.startsWith('/take')) {
        return <TakePage />;
    }
    if (!isAuthenticated) {
        return <AuthPage onLoginSuccess={handleLoginSuccess}/>;
    }
    if (isAdmin) {
        if (location.pathname.startsWith('/admin/external-tests/new') || /^\/admin\/external-tests\/\d+$/.test(location.pathname)) {
            return <ExternalTestEditorPage />;
        }
        if (location.pathname.startsWith('/admin/external-tests')) {
            return <ExternalTestsListPage />;
        }
        return <AdminPage />;
    }
    if (testStage === 'preliminary' || testStage === 'main') {
        return (<UnifiedTestInterface key="unified-test" onTestComplete={handleTestComplete} onLogout={handleLogout} cameraStream={proctoringCameraStream} screenStream={screenState.stream} proctoringState={proctoringState} screenState={screenState} audioState={audioState} videoRef={videoRef} canvasRef={canvasRef} onVideoMetadataLoaded={onVideoMetadataLoaded} logCheatingEvent={logCheatingEvent} isTestActive={isTestActive} setIsTestActive={setIsTestActive} stopProctoringSession={stopProctoringSession} pauseProctoringSession={pauseProctoringSession} pauseProctoringSessionKeepRecording={pauseProctoringSessionKeepRecording} resumeProctoringMonitoring={resumeProctoringMonitoring} resetForNewTest={resetForNewTest} requestFullscreenProgrammatically={requestFullscreenProgrammatically} saveCurrentRecording={saveCurrentRecording} saveFinalRecording={saveFinalRecording} setTransitionState={setTransitionState} initialSessionId={undefined} testLanguage={selectedTestLanguage}/>);
    }
    return (<TestStartPage key={testStartKey} onLogout={handleLogout} onStartTest={handleStartPreliminaryTest} proctoringState={proctoringState} screenState={screenState} audioState={audioState} requestCameraStream={requestCameraStream} requestScreenStream={requestScreenStream} startMonitoring={startMonitoring} proctoringCameraStream={proctoringCameraStream} onVideoMetadataLoaded={onVideoMetadataLoaded} logCheatingEvent={logCheatingEvent} isTestActive={isTestActive} videoRef={videoRef} canvasRef={canvasRef}/>);
};

import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as faceapi from 'face-api.js';
import * as tf from '@tensorflow/tfjs';
import { PROCTORING_CONFIG, FACE_ANALYSIS_CONFIG, VIOLATION_TYPES } from './config';
import type { ProctoringState, ScreenState, AudioState } from './types';
import { sessionManager, setCurrentSessionId, currentSessionId, isCurrentSessionPreliminary } from './session-manager';
import { ViolationManager } from './violation-manager';
import { ScreenRecorderV2 } from './screen-recorder-v2';
import { useFileUpload } from '../../hooks/useFileUpload';
import { FaceAnalyzer } from './face-analyzer';
import { initializeEnvironmentDetectors } from './environment-detectors';
import { t } from '../i18n';
export const useProctoring = (isTestActive: boolean, videoRef: React.RefObject<HTMLVideoElement | null>, canvasRef: React.RefObject<HTMLCanvasElement | null>) => {
    const [proctoringState, setProctoringState] = useState<ProctoringState>({
        modelsLoaded: false, cameraEnabled: false, faceDetected: false, multipleFaces: false,
        headTurned: false, lookingAway: false, eyesClosed: false, error: '', videoReady: false,
        violationCount: 0, isTestTerminated: false, showFullscreenPrompt: false,
        fullscreenRequestRefused: false, isTransitioning: false,
    });
    const [screenState, setScreenState] = useState<ScreenState>({ isScreenShared: false, isEntireScreen: false, error: '', stream: null });
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const violationManagerRef = useRef<ViolationManager | null>(null);
    const recorderRef = useRef<ScreenRecorderV2 | null>(null);
    const faceAnalyzerRef = useRef<FaceAnalyzer | null>(null);
    const faceAnalysisIntervalRef = useRef<number | null>(null);
    const isTransitioningRef = useRef(false);
    const [currentSessionId, setCurrentSessionId] = useState<string>('');
    const uploadHook = useFileUpload(currentSessionId);
    useEffect(() => {
        const updateSessionId = () => {
            const newSessionId = sessionManager.getRecordingSessionId() || '';
            if (newSessionId !== currentSessionId) {
                console.log('Updating sessionId from sessionManager:', newSessionId);
                setCurrentSessionId(newSessionId);
                if (recorderRef.current && newSessionId) {
                    recorderRef.current.updateSessionId(newSessionId);
                }
            }
        };
        updateSessionId();
        const interval = setInterval(() => {
            if (!currentSessionId) {
                updateSessionId();
            }
            else {
                clearInterval(interval);
            }
        }, 100);
        return () => clearInterval(interval);
    }, [currentSessionId]);
    if (!violationManagerRef.current) {
        violationManagerRef.current = new ViolationManager(setProctoringState);
    }
    if (!faceAnalyzerRef.current) {
        faceAnalyzerRef.current = new FaceAnalyzer();
    }
    const logCheatingEvent = useCallback((type: string, metadata?: object) => {
        violationManagerRef.current?.log(type, metadata);
    }, []);
    const stopProctoringSession = useCallback(() => {
        console.log('Stopping proctoring session completely.');
        if (faceAnalysisIntervalRef.current)
            clearInterval(faceAnalysisIntervalRef.current);
        recorderRef.current?.stop();
        cameraStream?.getTracks().forEach(track => track.stop());
        screenState.stream?.getTracks().forEach(track => track.stop());
        setCameraStream(null);
        setScreenState(prev => ({ ...prev, isScreenShared: false, stream: null }));
        if (document.fullscreenElement)
            document.exitFullscreen();
    }, [cameraStream, screenState.stream]);
    const pauseProctoringSessionKeepRecording = useCallback(() => {
        console.log('Pausing proctoring, keeping recording active.');
        if (faceAnalysisIntervalRef.current)
            clearInterval(faceAnalysisIntervalRef.current);
        recorderRef.current?.saveIntermediateRecording();
    }, []);
    const resetForNewTest = useCallback(() => {
        setProctoringState(prev => ({
            ...prev, violationCount: 0, isTestTerminated: false, faceDetected: false,
            multipleFaces: false, headTurned: false, lookingAway: false,
            eyesClosed: false, error: '', showFullscreenPrompt: false, fullscreenRequestRefused: false,
        }));
        sessionManager.resetForNewTest();
        console.log('Proctoring state reset for new test.');
    }, []);
    useEffect(() => {
        const loadModels = async () => {
            try {
                await tf.setBackend('webgl');
                await tf.ready();
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(PROCTORING_CONFIG.MODELS_PATH),
                    faceapi.nets.faceLandmark68Net.loadFromUri(PROCTORING_CONFIG.MODELS_PATH),
                ]);
                setProctoringState(prev => ({ ...prev, modelsLoaded: true }));
                console.log('Face-api models loaded.');
            }
            catch (err) {
                console.error('Error loading face-api models:', err);
                setProctoringState(prev => ({ ...prev, error: (err as Error).message }));
            }
        };
        if (!proctoringState.modelsLoaded) {
            loadModels();
        }
    }, [proctoringState.modelsLoaded]);
    useEffect(() => {
        if (proctoringState.isTestTerminated) {
            stopProctoringSession();
        }
    }, [proctoringState.isTestTerminated, stopProctoringSession]);
    useEffect(() => {
        const handleFullscreenChange = () => {
            if (isTransitioningRef.current)
                return;
            if (!document.fullscreenElement && isTestActive && !proctoringState.isTestTerminated) {
                logCheatingEvent(VIOLATION_TYPES.FULLSCREEN_EXITED);
                if (!proctoringState.fullscreenRequestRefused) {
                    setProctoringState(prev => ({ ...prev, showFullscreenPrompt: true }));
                }
            }
            else if (document.fullscreenElement) {
                setProctoringState(prev => ({ ...prev, showFullscreenPrompt: false, fullscreenRequestRefused: false }));
            }
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, [isTestActive, proctoringState.isTestTerminated, proctoringState.fullscreenRequestRefused, logCheatingEvent]);
    useEffect(() => {
        if (!isTestActive)
            return () => { };
        console.log("Initializing environment detectors.");
        const cleanup = initializeEnvironmentDetectors(logCheatingEvent);
        return cleanup;
    }, [isTestActive, logCheatingEvent]);
    const requestCameraStream = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true });
            setCameraStream(stream);
            setProctoringState(prev => ({ ...prev, cameraEnabled: true, error: '' }));
            return stream;
        }
        catch (err) {
            console.error('CRITICAL: Camera access denied.', err);
            logCheatingEvent(VIOLATION_TYPES.CAMERA_ACCESS_DENIED);
            setProctoringState(prev => ({ ...prev, cameraEnabled: false, error: t('cameraAccessError'), isTestTerminated: true }));
            return null;
        }
    }, [logCheatingEvent]);
    const requestScreenStream = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            if (stream.getVideoTracks()[0].getSettings().displaySurface !== 'monitor') {
                logCheatingEvent(VIOLATION_TYPES.SCREEN_SHARE_NOT_ENTIRE);
                stream.getTracks().forEach(track => track.stop());
                setScreenState(prev => ({ ...prev, isScreenShared: false, error: 'Пожалуйста, выберите демонстрацию всего экрана.' }));
                return null;
            }
            setScreenState({ isScreenShared: true, isEntireScreen: true, error: '', stream });
            stream.getVideoTracks()[0].onended = () => {
                logCheatingEvent(VIOLATION_TYPES.SCREEN_SHARE_STOPPED);
                setScreenState(prev => ({ ...prev, isScreenShared: false, stream: null }));
            };
            return stream;
        }
        catch (err) {
            console.error('CRITICAL: Screen share denied.', err);
            logCheatingEvent(VIOLATION_TYPES.SCREEN_SHARE_DENIED);
            setScreenState(prev => ({ ...prev, isScreenShared: false, error: 'Не удалось получить доступ к экрану.' }));
            setProctoringState(prev => ({ ...prev, isTestTerminated: true }));
            return null;
        }
    }, [logCheatingEvent]);
    const startMonitoring = useCallback((camStream: MediaStream, scrStream: MediaStream) => {
        if (recorderRef.current && recorderRef.current.getRecordingInfo().isRecording) {
            console.log('Recorder already exists and recording, updating sessionId only');
            if (currentSessionId) {
                recorderRef.current.updateSessionId(currentSessionId);
            }
            return;
        }
        if (recorderRef.current)
            recorderRef.current.stop();
        recorderRef.current = new ScreenRecorderV2(camStream, scrStream, logCheatingEvent, currentSessionId, {
            uploadScreenRecording: uploadHook.uploadScreenRecording,
            uploadState: uploadHook.uploadState
        });
        recorderRef.current.start();
    }, [logCheatingEvent, currentSessionId, uploadHook]);
    useEffect(() => {
        if (faceAnalysisIntervalRef.current)
            return;
        if (!isTestActive || !proctoringState.modelsLoaded || !cameraStream || !videoRef.current) {
            if (faceAnalysisIntervalRef.current) {
                clearInterval(faceAnalysisIntervalRef.current);
                faceAnalysisIntervalRef.current = null;
            }
            return;
        }
        console.log('Starting face analysis loop for the first time...');
        let gracePeriod = true;
        setTimeout(() => { gracePeriod = false; }, FACE_ANALYSIS_CONFIG.STARTUP_GRACE_PERIOD_MS);
        faceAnalysisIntervalRef.current = window.setInterval(async () => {
            const videoEl = videoRef.current;
            const canvasEl = canvasRef.current;
            if (gracePeriod || !videoEl || !canvasEl)
                return;
            try {
                const result = await faceAnalyzerRef.current?.analyze(videoEl);
                if (result) {
                    setProctoringState(prev => ({ ...prev, ...result.state }));
                    result.violations.forEach(violationType => logCheatingEvent(violationType));
                    canvasEl.getContext('2d')!.clearRect(0, 0, canvasEl.width, canvasEl.height);
                }
            }
            catch (error) {
                console.error("Face analysis failed:", error);
            }
        }, FACE_ANALYSIS_CONFIG.LOOP_INTERVAL_MS);
        return () => {
            if (faceAnalysisIntervalRef.current) {
                clearInterval(faceAnalysisIntervalRef.current);
                faceAnalysisIntervalRef.current = null;
            }
        };
    }, [isTestActive, proctoringState.modelsLoaded, cameraStream, videoRef, canvasRef, logCheatingEvent]);
    const setTransitionState = useCallback((isTransitioning: boolean) => {
        setProctoringState(prev => {
            if (prev.isTransitioning === isTransitioning) {
                return prev;
            }
            console.log(`Setting transition state: ${isTransitioning}`);
            isTransitioningRef.current = isTransitioning;
            if (isTransitioning) {
                setTimeout(() => {
                    if (isTransitioningRef.current) {
                        console.warn('Transition state timeout. Forcing false.');
                        isTransitioningRef.current = false;
                        setProctoringState(p => ({ ...p, isTransitioning: false }));
                    }
                }, PROCTORING_CONFIG.FULLSCREEN_TRANSITION_TIMEOUT_MS);
            }
            return { ...prev, isTransitioning };
        });
    }, []);
    const requestFullscreenProgrammatically = useCallback(async () => {
        try {
            await document.documentElement.requestFullscreen();
            setProctoringState(prev => ({ ...prev, showFullscreenPrompt: false, fullscreenRequestRefused: false }));
        }
        catch (err) {
            console.error("Error requesting fullscreen:", err);
            logCheatingEvent('fullscreen_request_denied');
            setProctoringState(prev => ({ ...prev, fullscreenRequestRefused: true }));
        }
    }, [logCheatingEvent]);
    useEffect(() => {
        if (isTestActive && !document.fullscreenElement) {
            console.log('Test is active, requesting fullscreen...');
            requestFullscreenProgrammatically();
        }
    }, [isTestActive, requestFullscreenProgrammatically]);
    const pauseProctoringSession = useCallback(() => {
        console.log('Pausing proctoring session (camera preserved, recording continues).');
        if (faceAnalysisIntervalRef.current)
            clearInterval(faceAnalysisIntervalRef.current);
        setProctoringState(prev => ({ ...prev, faceDetected: false, multipleFaces: false, headTurned: false, lookingAway: false, eyesClosed: false }));
        setScreenState(prev => ({ ...prev, isScreenShared: false, stream: null }));
        if (document.fullscreenElement)
            document.exitFullscreen();
    }, []);
    const resumeProctoringMonitoring = useCallback(() => {
        console.log('Resuming proctoring monitoring for main test...');
        if (faceAnalysisIntervalRef.current) {
            clearInterval(faceAnalysisIntervalRef.current);
            faceAnalysisIntervalRef.current = null;
        }
        if (isTestActive && proctoringState.modelsLoaded && cameraStream && videoRef.current) {
            console.log('Restarting face analysis loop...');
            let gracePeriod = true;
            setTimeout(() => {
                console.log("Grace period for main test ended. Violation detection active.");
                gracePeriod = false;
            }, FACE_ANALYSIS_CONFIG.STARTUP_GRACE_PERIOD_MS);
            faceAnalysisIntervalRef.current = window.setInterval(async () => {
                const videoEl = videoRef.current;
                const canvasEl = canvasRef.current;
                if (gracePeriod || !videoEl || !canvasEl)
                    return;
                try {
                    const result = await faceAnalyzerRef.current?.analyze(videoEl);
                    if (result) {
                        setProctoringState(prev => ({ ...prev, ...result.state }));
                        result.violations.forEach(violationType => logCheatingEvent(violationType));
                        canvasEl.getContext('2d')!.clearRect(0, 0, canvasEl.width, canvasEl.height);
                    }
                }
                catch (error) {
                    console.error("Face analysis failed after resume:", error);
                }
            }, FACE_ANALYSIS_CONFIG.LOOP_INTERVAL_MS);
        }
        else {
            console.warn("Could not resume proctoring, conditions not met:", { isTestActive, modelsLoaded: proctoringState.modelsLoaded, cameraStream: !!cameraStream });
        }
    }, [isTestActive, proctoringState.modelsLoaded, cameraStream, videoRef, canvasRef, logCheatingEvent]);
    const resetProctoringState = useCallback(() => {
        stopProctoringSession();
        setProctoringState({
            modelsLoaded: false, cameraEnabled: false, faceDetected: false, multipleFaces: false,
            headTurned: false, lookingAway: false, eyesClosed: false, error: '', videoReady: false,
            violationCount: 0, isTestTerminated: false, showFullscreenPrompt: false,
            fullscreenRequestRefused: false, isTransitioning: false,
        });
        setScreenState({ isScreenShared: false, isEntireScreen: false, error: '', stream: null });
        setCameraStream(null);
        sessionManager.resetForNewTest();
        console.log('Proctoring state completely reset.');
    }, [stopProctoringSession]);
    const resetViolationState = useCallback(() => {
        setProctoringState(prev => ({ ...prev, violationCount: 0, isTestTerminated: false }));
        console.log('Violation state has been reset.');
    }, []);
    const onVideoMetadataLoaded = useCallback(() => {
        setProctoringState(prev => ({ ...prev, videoReady: true }));
        console.log("Video metadata loaded, ready for detection.");
    }, []);
    const saveCurrentRecording = useCallback(async () => {
        await recorderRef.current?.saveIntermediateRecording();
    }, []);
    const saveFinalRecording = useCallback(async () => {
        recorderRef.current?.stop();
        await new Promise(resolve => setTimeout(resolve, 2000));
    }, []);
    return {
        videoRef, canvasRef, proctoringState, screenState,
        audioState: { isMonitoring: false, noiseLevel: 0, isSilent: true, error: '' },
        cameraStream,
        logCheatingEvent,
        uploadState: uploadHook.uploadState,
        requestCameraStream,
        requestScreenStream,
        startMonitoring,
        stopProctoringSession,
        pauseProctoringSession,
        pauseProctoringSessionKeepRecording,
        resumeProctoringMonitoring,
        resetProctoringState,
        resetForNewTest,
        resetViolationState,
        onVideoMetadataLoaded,
        requestFullscreenProgrammatically,
        saveCurrentRecording,
        saveFinalRecording,
        setTransitionState,
        checkUploadStatus: uploadHook.checkUploadStatus,
        cancelUpload: uploadHook.cancelUpload,
        resetUpload: uploadHook.resetUpload,
        forceCleanupMediaRecorder: () => recorderRef.current?.stop(),
        checkMediaRecorderStatus: () => ({
            state: recorderRef.current?.getRecordingInfo() || 'inactive',
            uploadState: recorderRef.current?.getUploadState()
        }),
        exportDiagnosticInfo: () => ({
            recording: recorderRef.current?.getRecordingInfo(),
            upload: uploadHook.uploadState
        }),
    };
};
export { setCurrentSessionId, currentSessionId, isCurrentSessionPreliminary };
export type { ProctoringState, ScreenState, AudioState };

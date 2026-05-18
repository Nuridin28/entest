import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import * as tf from '@tensorflow/tfjs';
import { externalAttemptsApi } from '../../shared/api/externalTests';
import { FaceAnalyzer } from '../../shared/utils/proctoring/face-analyzer';
import { ScreenRecorderV2 } from '../../shared/utils/proctoring/screen-recorder-v2';
import { PROCTORING_CONFIG, FACE_ANALYSIS_CONFIG, VIOLATION_TYPES } from '../../shared/utils/proctoring/config';
import { useExternalFileUpload } from './useExternalFileUpload';

interface Options {
    token: string;
    isTestActive: boolean;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export interface ExternalProctoringState {
    modelsLoaded: boolean;
    cameraEnabled: boolean;
    screenShared: boolean;
    faceDetected: boolean;
    multipleFaces: boolean;
    headTurned: boolean;
    lookingAway: boolean;
    eyesClosed: boolean;
    violationCount: number;
    isTerminated: boolean;
    error: string;
}

const SEVERITY: Record<string, string> = {
    [VIOLATION_TYPES.NO_FACE]: 'critical',
    [VIOLATION_TYPES.MULTIPLE_FACES]: 'critical',
    [VIOLATION_TYPES.TAB_SWITCHED]: 'critical',
    [VIOLATION_TYPES.FULLSCREEN_EXITED]: 'critical',
    [VIOLATION_TYPES.WINDOW_LOST_FOCUS]: 'critical',
    [VIOLATION_TYPES.SCREEN_SHARE_STOPPED]: 'critical',
    [VIOLATION_TYPES.SCREEN_SHARE_DENIED]: 'critical',
    [VIOLATION_TYPES.CAMERA_ACCESS_DENIED]: 'critical',
    [VIOLATION_TYPES.HEAD_TURNED]: 'high',
    [VIOLATION_TYPES.LOOKING_AWAY]: 'high',
    [VIOLATION_TYPES.EYES_CLOSED]: 'high',
    [VIOLATION_TYPES.TEXT_COPIED]: 'low',
    [VIOLATION_TYPES.TEXT_PASTED]: 'low',
};

export const useExternalProctoring = ({ token, isTestActive, videoRef, canvasRef }: Options) => {
    const [state, setState] = useState<ExternalProctoringState>({
        modelsLoaded: false, cameraEnabled: false, screenShared: false,
        faceDetected: false, multipleFaces: false,
        headTurned: false, lookingAway: false, eyesClosed: false,
        violationCount: 0, isTerminated: false, error: '',
    });

    // Use state (not refs) so face-detection useEffect re-runs when streams change
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

    const recorderRef = useRef<ScreenRecorderV2 | null>(null);
    const faceAnalyzerRef = useRef<FaceAnalyzer>(new FaceAnalyzer());
    const faceIntervalRef = useRef<number | null>(null);
    const lastViolationAtRef = useRef<Record<string, number>>({});

    const { uploadState, uploadScreenRecording } = useExternalFileUpload(token);

    // Load face-api models once
    useEffect(() => {
        (async () => {
            try {
                await tf.setBackend('webgl');
                await tf.ready();
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(PROCTORING_CONFIG.MODELS_PATH),
                    faceapi.nets.faceLandmark68Net.loadFromUri(PROCTORING_CONFIG.MODELS_PATH),
                ]);
                setState(prev => ({ ...prev, modelsLoaded: true }));
            } catch (err) {
                console.error('Face-api models failed to load:', err);
            }
        })();
    }, []);

    const logViolation = useCallback((type: string, description?: string) => {
        const now = Date.now();
        const last = lastViolationAtRef.current[type] || 0;
        if (now - last < PROCTORING_CONFIG.VIOLATION_COOLDOWN_MS) return;
        lastViolationAtRef.current[type] = now;

        setState(prev => {
            if (prev.isTerminated) return prev;
            const next = prev.violationCount + 1;
            return { ...prev, violationCount: next, isTerminated: next >= PROCTORING_CONFIG.MAX_VIOLATIONS_ALLOWED };
        });
        externalAttemptsApi.logViolation(token, {
            violation_type: type,
            severity: SEVERITY[type] || 'medium',
            description: description ?? type,
        });
    }, [token]);

    const requestCameraStream = useCallback(async (): Promise<MediaStream | null> => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true });
            setCameraStream(stream);
            setState(prev => ({ ...prev, cameraEnabled: true, error: '' }));
            return stream;
        } catch {
            logViolation(VIOLATION_TYPES.CAMERA_ACCESS_DENIED, 'Камера недоступна');
            setState(prev => ({ ...prev, cameraEnabled: false, error: 'Нет доступа к камере', isTerminated: true }));
            return null;
        }
    }, [logViolation]);

    // Adopt an already-obtained camera stream (avoids a second getUserMedia call)
    const injectCameraStream = useCallback((stream: MediaStream) => {
        setCameraStream(stream);
        setState(prev => ({ ...prev, cameraEnabled: true, error: '' }));
    }, []);

    const requestScreenStream = useCallback(async (): Promise<MediaStream | null> => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            if (stream.getVideoTracks()[0]?.getSettings().displaySurface !== 'monitor') {
                logViolation(VIOLATION_TYPES.SCREEN_SHARE_DENIED, 'Не весь экран');
                stream.getTracks().forEach(t => t.stop());
                setState(prev => ({ ...prev, screenShared: false, error: 'Выберите демонстрацию всего экрана.' }));
                return null;
            }
            setScreenStream(stream);
            setState(prev => ({ ...prev, screenShared: true, error: '' }));
            stream.getVideoTracks()[0].onended = () => {
                logViolation(VIOLATION_TYPES.SCREEN_SHARE_STOPPED, 'Запись экрана остановлена');
                setScreenStream(null);
                setState(prev => ({ ...prev, screenShared: false }));
            };
            return stream;
        } catch {
            logViolation(VIOLATION_TYPES.SCREEN_SHARE_DENIED, 'Нет доступа к экрану');
            setState(prev => ({ ...prev, screenShared: false, error: 'Нет доступа к экрану', isTerminated: true }));
            return null;
        }
    }, [logViolation]);

    const startMonitoring = useCallback((camStream: MediaStream, scrStream: MediaStream) => {
        if (recorderRef.current) recorderRef.current.stop();
        recorderRef.current = new ScreenRecorderV2(
            camStream,
            scrStream,
            logViolation,
            `ext_${token}`,
            { uploadScreenRecording, uploadState },
        );
        recorderRef.current.start();
    }, [logViolation, token, uploadScreenRecording, uploadState]);

    const stopProctoring = useCallback(() => {
        if (faceIntervalRef.current) { clearInterval(faceIntervalRef.current); faceIntervalRef.current = null; }
        recorderRef.current?.stop();
        cameraStream?.getTracks().forEach(t => t.stop());
        screenStream?.getTracks().forEach(t => t.stop());
        setCameraStream(null);
        setScreenStream(null);
        if (document.fullscreenElement) document.exitFullscreen();
    }, [cameraStream, screenStream]);

    // Terminate when max violations reached
    useEffect(() => {
        if (state.isTerminated) stopProctoring();
    }, [state.isTerminated, stopProctoring]);

    // Face detection loop — depends on cameraStream state so it restarts when camera becomes available
    useEffect(() => {
        if (!isTestActive || !state.modelsLoaded || !cameraStream || !videoRef.current) return;
        if (faceIntervalRef.current) return;

        let grace = true;
        const graceTimer = setTimeout(() => { grace = false; }, FACE_ANALYSIS_CONFIG.STARTUP_GRACE_PERIOD_MS);

        faceIntervalRef.current = window.setInterval(async () => {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (grace || !video || !canvas) return;
            try {
                const result = await faceAnalyzerRef.current.analyze(video);
                if (result) {
                    setState(prev => ({ ...prev,
                        faceDetected: result.state.faceDetected,
                        multipleFaces: result.state.multipleFaces,
                        headTurned: result.state.headTurned,
                        lookingAway: result.state.lookingAway,
                        eyesClosed: result.state.eyesClosed,
                    }));
                    result.violations.forEach(v => logViolation(v));
                    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
                }
            } catch { /* ignore individual frame errors */ }
        }, FACE_ANALYSIS_CONFIG.LOOP_INTERVAL_MS);

        return () => {
            clearTimeout(graceTimer);
            if (faceIntervalRef.current) { clearInterval(faceIntervalRef.current); faceIntervalRef.current = null; }
        };
    }, [isTestActive, state.modelsLoaded, cameraStream, videoRef, canvasRef, logViolation]);

    // Browser event monitoring
    useEffect(() => {
        if (!isTestActive) return;

        let lastBlur = 0;
        const onBlur = () => {
            const now = Date.now();
            if (now - lastBlur < 800) return;
            lastBlur = now;
            logViolation(VIOLATION_TYPES.WINDOW_LOST_FOCUS, 'Окно потеряло фокус');
        };
        const onVisibility = () => {
            if (document.visibilityState === 'hidden')
                logViolation(VIOLATION_TYPES.TAB_SWITCHED, 'Переключение вкладки');
        };
        const onFs = () => {
            if (!document.fullscreenElement)
                logViolation(VIOLATION_TYPES.FULLSCREEN_EXITED, 'Выход из полноэкранного режима');
        };
        const onCopy = () => logViolation(VIOLATION_TYPES.TEXT_COPIED, 'Копирование текста');
        const onPaste = () => logViolation(VIOLATION_TYPES.TEXT_PASTED, 'Вставка текста');
        const onCtxMenu = (e: MouseEvent) => { e.preventDefault(); };

        window.addEventListener('blur', onBlur);
        document.addEventListener('visibilitychange', onVisibility);
        document.addEventListener('fullscreenchange', onFs);
        document.addEventListener('copy', onCopy);
        document.addEventListener('paste', onPaste);
        document.addEventListener('contextmenu', onCtxMenu);

        return () => {
            window.removeEventListener('blur', onBlur);
            document.removeEventListener('visibilitychange', onVisibility);
            document.removeEventListener('fullscreenchange', onFs);
            document.removeEventListener('copy', onCopy);
            document.removeEventListener('paste', onPaste);
            document.removeEventListener('contextmenu', onCtxMenu);
        };
    }, [isTestActive, logViolation]);

    const enterFullscreen = useCallback(async () => {
        try { await document.documentElement.requestFullscreen(); } catch { /* user denied */ }
    }, []);

    return {
        state,
        cameraStream,
        uploadState,
        requestCameraStream,
        injectCameraStream,
        requestScreenStream,
        startMonitoring,
        stopProctoring,
        enterFullscreen,
        logViolation,
    };
};

export interface ProctoringState {
    modelsLoaded: boolean;
    cameraEnabled: boolean;
    faceDetected: boolean;
    multipleFaces: boolean;
    headTurned: boolean;
    lookingAway: boolean;
    eyesClosed: boolean;
    error: string;
    videoReady: boolean;
    violationCount: number;
    isTestTerminated: boolean;
    showFullscreenPrompt: boolean;
    fullscreenRequestRefused: boolean;
    isTransitioning: boolean;
}
export interface ScreenState {
    isScreenShared: boolean;
    isEntireScreen: boolean;
    error: string;
    stream: MediaStream | null;
}
export interface AudioState {
    isMonitoring: boolean;
    noiseLevel: number;
    isSilent: boolean;
    error: string;
}
export interface FaceAnalysisResult {
    violations: string[];
    state: {
        faceDetected: boolean;
        multipleFaces: boolean;
        headTurned: boolean;
        lookingAway: boolean;
        eyesClosed: boolean;
    };
    detections: any[];
}

import UnifiedTestInterface from '../../widgets/UnifiedTestInterface';
interface TestPageProps {
    localSessionId: string | undefined;
    setTestStage: (stage: 'start' | 'preliminary' | 'main') => void;
    testStage: 'start' | 'preliminary' | 'main';
    onTestComplete: () => void;
    onLogout: () => void;
    cameraStream: MediaStream | null;
    screenStream: MediaStream | null;
    proctoringState: any;
    screenState: any;
    audioState: any;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    proctoringCameraStream: MediaStream | null;
    onVideoMetadataLoaded: () => void;
    isTestActive: boolean;
    setIsTestActive: React.Dispatch<React.SetStateAction<boolean>>;
    logCheatingEvent: (type: string, metadata?: object) => void;
    testStartKey: number;
    stopProctoringSession: () => void;
    pauseProctoringSession: () => void;
    pauseProctoringSessionKeepRecording: () => void;
    resumeProctoringMonitoring: () => void;
    resetForNewTest: () => void;
    requestFullscreenProgrammatically: () => Promise<void>;
    saveCurrentRecording: () => Promise<void>;
    saveFinalRecording: () => Promise<void>;
    setTransitionState: (isTransitioning: boolean) => void;
    initialSessionId?: string;
}
function TestPage(props: TestPageProps) {
    return <UnifiedTestInterface {...props}/>;
}
export default TestPage;

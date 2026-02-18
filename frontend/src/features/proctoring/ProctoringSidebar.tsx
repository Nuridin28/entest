import { ViolationTracker } from '@features/proctoring';
import { ProctoringCamera } from '@features/proctoring';
interface ProctoringSidebarProps {
    violationCount: number;
    isTestTerminated: boolean;
    sessionId: string;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    onVideoMetadataLoaded: () => void;
    videoReady: boolean;
    proctoringState: any;
    screenState: any;
    audioState: any;
    cameraStream: MediaStream | null;
}
export function ProctoringSidebar({ violationCount, isTestTerminated, sessionId, videoRef, canvasRef, onVideoMetadataLoaded, videoReady, proctoringState, screenState, audioState, cameraStream, }: ProctoringSidebarProps) {
    return (<div className="w-1/4 p-4 flex flex-col space-y-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg ml-4 h-full">
            <ViolationTracker violationCount={violationCount} isTestTerminated={isTestTerminated} sessionId={sessionId}/>
            <ProctoringCamera videoRef={videoRef} canvasRef={canvasRef} onVideoMetadataLoaded={onVideoMetadataLoaded} videoReady={videoReady} proctoringState={proctoringState} screenState={screenState} audioState={audioState} cameraStream={cameraStream}/>

            
        </div>);
}

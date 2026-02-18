import { useEffect, type RefObject } from 'react';
import { type ProctoringState, type ScreenState, type AudioState } from '@shared/utils/proctoring';
import { t } from '@shared/utils/i18n';
interface ProctoringCameraProps {
    videoRef: RefObject<HTMLVideoElement | null>;
    canvasRef: RefObject<HTMLCanvasElement | null>;
    proctoringState: ProctoringState;
    screenState: ScreenState;
    audioState: AudioState;
    cameraStream: MediaStream | null;
    onVideoMetadataLoaded: () => void;
    videoReady: boolean;
}
function ProctoringCamera({ videoRef, canvasRef, proctoringState, screenState, audioState, cameraStream, onVideoMetadataLoaded, videoReady: _videoReady }: ProctoringCameraProps) {
    const { cameraEnabled, faceDetected, headTurned, lookingAway, eyesClosed, error: proctoringError } = proctoringState;
    const { error: screenError } = screenState;
    const { isMonitoring: isAudioMonitoring, noiseLevel, error: audioError } = audioState;
    useEffect(() => {
        if (cameraEnabled && cameraStream && videoRef.current) {
            if (videoRef.current.srcObject !== cameraStream || videoRef.current.paused || videoRef.current.ended) {
                videoRef.current.srcObject = cameraStream;
                videoRef.current.play().catch(playError => {
                    if (playError.name !== "AbortError") {
                        console.error("Error playing video stream:", playError);
                    }
                });
            }
        }
    }, [cameraEnabled, cameraStream, videoRef]);
    useEffect(() => {
        const videoElement = videoRef.current;
        if (!videoElement)
            return;
        const handleLoadedMetadata = () => {
            if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0 && videoElement.readyState >= 2) {
                onVideoMetadataLoaded();
            }
        };
        videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
        if (videoElement.readyState >= 1) {
            handleLoadedMetadata();
        }
        return () => {
            videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
        };
    }, [videoRef, onVideoMetadataLoaded]);
    if (!cameraEnabled)
        return null;
    const overallError = proctoringError || screenError || audioError;
    return (<div className="w-full">
      <div className="bg-white rounded-lg shadow-lg border-2">
        <div className="bg-gray-800 text-white p-2 rounded-t-lg flex justify-between items-center text-xs">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${overallError ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
            <span>{t('monitoring')}</span>
          </div>
        </div>

        <div className="p-2">
          <div className="relative w-full pb-[75%] bg-gray-900 rounded overflow-hidden">
            <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover"/>
            <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full"/>

            
            <div className={`absolute top-2 right-2 p-1 rounded-full ${faceDetected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} style={{ width: '12px', height: '12px' }}></div>

            
            <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
              {faceDetected ? t('faceDetected') : t('noFaceDetected')}
            </div>

            {!cameraEnabled && (<div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75 text-white text-center text-xs p-2">
                {t('cameraInactive')}
              </div>)}

            {cameraEnabled && !videoRef.current?.srcObject && (<div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75 text-white text-center text-xs p-2">
                {t('noVideoStream')}
              </div>)}

            {overallError && (<div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75 text-white text-center text-xs p-2">
                {overallError}
              </div>)}

            {!overallError && cameraEnabled && faceDetected && (<div className="absolute bottom-1 left-1 flex space-x-1">
                {headTurned && <span className="text-orange-400 text-xs bg-black bg-opacity-50 px-1 rounded" title={t('headTurned')}>🔄</span>}
                {lookingAway && <span className="text-yellow-400 text-xs bg-black bg-opacity-50 px-1 rounded" title={t('lookingAway')}>👀</span>}
                {eyesClosed && <span className="text-red-400 text-xs bg-black bg-opacity-50 px-1 rounded" title={t('eyesClosed')}>😴</span>}
              </div>)}
          </div>
          
          <div className="mt-2 text-center text-xs text-gray-700">
            {isAudioMonitoring && (<div className="w-full bg-gray-200 rounded-full h-1.5">
                <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(noiseLevel * 5, 100)}%` }} title={t('noiseLevel', { level: noiseLevel.toFixed(2) })}></div>
              </div>)}
            <span className="mt-1 block">
              {overallError ? t('problemDetected') : t('monitoringActive')}
            </span>
          </div>
        </div>
      </div>
    </div>);
}
export default ProctoringCamera;

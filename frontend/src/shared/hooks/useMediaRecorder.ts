import { useRef, useCallback, useState } from 'react';
import { handleRecordingError } from '@shared/utils/errorHandler';
interface UseMediaRecorderOptions {
    mimeType?: string;
    onRecordingComplete?: (blob: Blob) => void;
    onRecordingError?: (error: any) => void;
}
export function useMediaRecorder(options: UseMediaRecorderOptions = {}) {
    const { mimeType = 'audio/webm;codecs=opus', onRecordingComplete, onRecordingError } = options;
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const startRecording = useCallback(async (): Promise<void> => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000
                }
            });
            streamRef.current = stream;
            audioChunksRef.current = [];
            const recorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = recorder;
            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };
            recorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
                onRecordingComplete?.(audioBlob);
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(track => track.stop());
                    streamRef.current = null;
                }
                setIsRecording(false);
            };
            recorder.onerror = () => {
                const error = new Error('Recording failed');
                onRecordingError?.(error) || handleRecordingError(error);
                stopRecording();
            };
            recorder.start();
            setIsRecording(true);
        }
        catch (error) {
            onRecordingError?.(error) || handleRecordingError(error);
            throw error;
        }
    }, [mimeType, onRecordingComplete, onRecordingError]);
    const stopRecording = useCallback((): void => {
        if (mediaRecorderRef.current && isRecording) {
            try {
                mediaRecorderRef.current.stop();
            }
            catch (error) {
                console.warn('Error stopping media recorder:', error);
            }
        }
    }, [isRecording]);
    const cleanup = useCallback((): void => {
        stopRecording();
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    }, [stopRecording]);
    return {
        startRecording,
        stopRecording,
        cleanup,
        isRecording
    };
}

import { useState, useCallback, useRef, useEffect } from 'react';
import { sessionManager } from '../utils/proctoring/session-manager';
export interface UploadState {
    progress: number;
    status: 'idle' | 'uploading' | 'processing' | 'completed' | 'error';
    error?: string;
    taskId?: string;
}
export interface ChunkUploadOptions {
    onProgress?: (progress: number) => void;
    onChunkUploaded?: (chunkIndex: number, totalChunks: number) => void;
    maxRetries?: number;
    chunkSize?: number;
    sessionId?: string;
}
export const useFileUpload = (initialSessionId: string) => {
    const [uploadState, setUploadState] = useState<UploadState>({
        progress: 0,
        status: 'idle'
    });
    const [currentSessionId, setCurrentSessionId] = useState<string>(initialSessionId);
    const abortControllerRef = useRef<AbortController | null>(null);
    const chunkIndexRef = useRef(0);
    useEffect(() => {
        if (initialSessionId && initialSessionId !== currentSessionId) {
            console.log('useFileUpload: Updating sessionId from', currentSessionId, 'to', initialSessionId);
            setCurrentSessionId(initialSessionId);
        }
    }, [initialSessionId, currentSessionId]);
    const updateProgress = useCallback((progress: number) => {
        setUploadState(prev => ({ ...prev, progress }));
    }, []);
    const updateStatus = useCallback((status: UploadState['status'], error?: string, taskId?: string) => {
        setUploadState(prev => ({ ...prev, status, error, taskId }));
    }, []);
    const uploadChunk = useCallback(async (blob: Blob, isFinal: boolean = false, options: ChunkUploadOptions = {}): Promise<any> => {
        const { onProgress, onChunkUploaded, maxRetries = 3, sessionId: optionSessionId } = options;
        const chunkIndex = chunkIndexRef.current++;
        const formData = new FormData();
        formData.append('chunk', blob, `chunk_${chunkIndex}.webm`);
        formData.append('chunk_index', chunkIndex.toString());
        formData.append('is_final', isFinal.toString());
        let attempt = 0;
        while (attempt < maxRetries) {
            try {
                updateStatus('uploading');
                abortControllerRef.current = new AbortController();
                const recordingSessionId = sessionManager.getRecordingSessionId();
                const sessionIdToUse = optionSessionId || recordingSessionId || currentSessionId;
                let waitAttempts = 0;
                while (!sessionIdToUse && waitAttempts < 50) {
                    console.log('Waiting for sessionId, attempt:', waitAttempts);
                    await new Promise(resolve => setTimeout(resolve, 100));
                    waitAttempts++;
                }
                if (!sessionIdToUse) {
                    throw new Error('Session ID is empty in useFileUpload after waiting');
                }
                const url = `/api/v1/upload/screen-chunk/${sessionIdToUse}`;
                const response = await fetch(url, {
                    method: 'POST',
                    body: formData,
                    signal: abortControllerRef.current.signal,
                    headers: {
                        'Authorization': localStorage.getItem('access_token') ?
                            `Bearer ${localStorage.getItem('access_token')}` : ''
                    }
                });
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
                }
                const result = await response.json();
                if (onProgress) {
                    const progress = isFinal ? 100 : Math.min(95, (chunkIndex + 1) * 10);
                    onProgress(progress);
                    updateProgress(progress);
                }
                if (onChunkUploaded && !isFinal) {
                    onChunkUploaded(chunkIndex, chunkIndex + 1);
                }
                if (isFinal) {
                    updateStatus('completed');
                }
                return result;
            }
            catch (error: any) {
                attempt++;
                if (error.name === 'AbortError') {
                    updateStatus('error', 'Upload cancelled');
                    throw error;
                }
                if (attempt >= maxRetries) {
                    const errorMessage = error.message || 'Upload failed after multiple attempts';
                    updateStatus('error', errorMessage);
                    throw new Error(errorMessage);
                }
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
        }
    }, [currentSessionId, updateStatus, updateProgress]);
    const uploadScreenRecording = useCallback(async (videoBlob: Blob, options: ChunkUploadOptions = {}): Promise<void> => {
        try {
            updateStatus('uploading');
            updateProgress(0);
            chunkIndexRef.current = 0;
            const { chunkSize = 5 * 1024 * 1024 } = options;
            if (videoBlob.size <= chunkSize) {
                await uploadChunk(videoBlob, true, options);
            }
            else {
                const totalChunks = Math.ceil(videoBlob.size / chunkSize);
                for (let i = 0; i < totalChunks; i++) {
                    const start = i * chunkSize;
                    const end = Math.min(start + chunkSize, videoBlob.size);
                    const chunk = videoBlob.slice(start, end);
                    const isFinal = i === totalChunks - 1;
                    await uploadChunk(chunk, isFinal, {
                        ...options,
                        onProgress: (chunkProgress) => {
                            const totalProgress = ((i / totalChunks) * 100) + (chunkProgress / totalChunks);
                            updateProgress(Math.min(95, totalProgress));
                            options.onProgress?.(totalProgress);
                        }
                    });
                }
            }
        }
        catch (error: any) {
            updateStatus('error', error.message);
            throw error;
        }
    }, [uploadChunk, updateStatus, updateProgress]);
    const checkUploadStatus = useCallback(async (): Promise<any> => {
        try {
            const response = await fetch(`/api/v1/upload/status/${currentSessionId}`, {
                headers: {
                    'Authorization': localStorage.getItem('access_token') ?
                        `Bearer ${localStorage.getItem('access_token')}` : ''
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            if (result.status === 'completed') {
                updateStatus('completed');
                updateProgress(100);
            }
            else if (result.status === 'processing') {
                updateStatus('processing');
            }
            return result;
        }
        catch (error: any) {
            updateStatus('error', error.message);
            throw error;
        }
    }, [currentSessionId, updateStatus, updateProgress]);
    const cancelUpload = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            updateStatus('error', 'Upload cancelled');
        }
    }, [updateStatus]);
    const resetUpload = useCallback(() => {
        setUploadState({
            progress: 0,
            status: 'idle'
        });
        chunkIndexRef.current = 0;
        abortControllerRef.current = null;
    }, []);
    return {
        uploadState,
        uploadScreenRecording,
        checkUploadStatus,
        cancelUpload,
        resetUpload
    };
};

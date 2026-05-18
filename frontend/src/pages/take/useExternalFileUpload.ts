import { useCallback, useRef, useState } from 'react';
import { externalAttemptsApi } from '../../shared/api/externalTests';

export interface ExternalUploadState {
    status: 'idle' | 'uploading' | 'completed' | 'error';
    progress: number;
    error?: string;
}

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB

export const useExternalFileUpload = (token: string) => {
    const [uploadState, setUploadState] = useState<ExternalUploadState>({ status: 'idle', progress: 0 });
    const chunkIndexRef = useRef(0);

    const uploadScreenRecording = useCallback(async (blob: Blob) => {
        setUploadState({ status: 'uploading', progress: 0 });
        chunkIndexRef.current = 0;

        const totalChunks = Math.ceil(blob.size / CHUNK_SIZE);
        try {
            for (let i = 0; i < totalChunks; i++) {
                const start = i * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, blob.size);
                const chunk = blob.slice(start, end);
                const isFinal = i === totalChunks - 1;
                await externalAttemptsApi.uploadScreenChunk(token, chunk, chunkIndexRef.current++, isFinal);
                setUploadState({ status: 'uploading', progress: Math.round(((i + 1) / totalChunks) * 100) });
            }
            setUploadState({ status: 'completed', progress: 100 });
        } catch (err) {
            setUploadState({ status: 'error', progress: 0, error: (err as Error).message });
        }
    }, [token]);

    return { uploadState, uploadScreenRecording };
};

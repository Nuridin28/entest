import { RECORDER_CONFIG } from './config';
import { sessionManager } from './session-manager';
import { addToast } from '../toast';
import type { UploadState } from '../../hooks/useFileUpload';
interface UploadHook {
    uploadScreenRecording: (blob: Blob, options?: any) => Promise<void>;
    uploadState: UploadState;
}
export class ScreenRecorderV2 {
    private mediaRecorder: MediaRecorder | null = null;
    private recordedChunks: Blob[] = [];
    private isRecording = false;
    private sessionId: string;
    private onViolation: (type: string, metadata?: object) => void;
    private uploadHook: UploadHook | null = null;
    private autoSaveInterval: number | null = null;
    constructor(cameraStream: MediaStream, screenStream: MediaStream, onViolation: (type: string, metadata?: object) => void, sessionId: string, uploadHook?: UploadHook) {
        this.onViolation = onViolation;
        this.sessionId = sessionId || sessionManager.getRecordingSessionId() || '';
        this.uploadHook = uploadHook || null;
        console.log('ScreenRecorderV2 initialized with sessionId:', this.sessionId);
        this.initialize(cameraStream, screenStream);
    }
    private initialize(cameraStream: MediaStream, screenStream: MediaStream) {
        const combinedStream = new MediaStream([
            ...screenStream.getVideoTracks(),
            ...cameraStream.getAudioTracks(),
        ]);
        const options: MediaRecorderOptions = {
            mimeType: MediaRecorder.isTypeSupported(RECORDER_CONFIG.MIME_TYPE_VP8)
                ? RECORDER_CONFIG.MIME_TYPE_VP8
                : RECORDER_CONFIG.MIME_TYPE_VP9,
            videoBitsPerSecond: RECORDER_CONFIG.BITRATE_VIDEO,
            audioBitsPerSecond: RECORDER_CONFIG.BITRATE_AUDIO,
        };
        try {
            this.mediaRecorder = new MediaRecorder(combinedStream, options);
            this.setupEventHandlers();
            console.log('ScreenRecorderV2 initialized with options:', options);
        }
        catch (error) {
            console.error('Failed to create MediaRecorder:', error);
            this.onViolation('media_recorder_init_failed', { message: (error as Error).message });
        }
    }
    private setupEventHandlers() {
        if (!this.mediaRecorder)
            return;
        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.recordedChunks.push(event.data);
                console.log(`Chunk recorded: ${event.data.size} bytes, total chunks: ${this.recordedChunks.length}`);
            }
        };
        this.mediaRecorder.onstop = () => {
            console.log('MediaRecorder stopped. Uploading final recording.');
            console.log(`Current chunks count: ${this.recordedChunks.length}`);
            this.uploadFinalRecording();
        };
        this.mediaRecorder.onerror = (event) => {
            console.error('MediaRecorder error:', event);
            this.onViolation('screen_recording_failed', { error: (event as any).error?.name });
        };
    }
    public start() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
            this.mediaRecorder.start(RECORDER_CONFIG.TIMESLICE_MS);
            this.isRecording = true;
            console.log('Screen recording started.');
            this.startAutoSave();
        }
    }
    public stop() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.stopAutoSave();
        }
    }
    private startAutoSave() {
        this.autoSaveInterval = window.setInterval(() => {
            if (this.isRecording) {
                this.saveIntermediateRecording();
            }
        }, 90000);
    }
    private stopAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }
    }
    public async saveIntermediateRecording() {
        if (!this.isRecording || this.recordedChunks.length === 0)
            return;
        const chunksToSave = [...this.recordedChunks];
        const blob = new Blob(chunksToSave, { type: 'video/webm' });
        if (blob.size < RECORDER_CONFIG.AUTO_SAVE_MIN_BLOB_SIZE_BYTES)
            return;
        console.log(`Auto-saving intermediate recording: ${(blob.size / 1024 / 1024).toFixed(2)}MB`);
        try {
            if (this.uploadHook) {
                await this.uploadHook.uploadScreenRecording(blob, {
                    sessionId: this.sessionId,
                    onProgress: (progress: number) => {
                        console.log(`Upload progress: ${progress}%`);
                    }
                });
            }
            else {
                await this.uploadWithFetch(blob, false);
            }
            console.log('Intermediate recording saved, keeping chunks for final upload');
        }
        catch (error) {
            console.error('Failed to save intermediate recording:', error);
            addToast({ type: 'warning', message: 'Не удалось сохранить промежуточную запись' });
        }
    }
    private async uploadFinalRecording() {
        console.log(`uploadFinalRecording called. Chunks count: ${this.recordedChunks.length}`);
        if (this.recordedChunks.length === 0) {
            console.log('No recorded chunks to upload');
            return;
        }
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        console.log(`Uploading final recording: ${(blob.size / 1024 / 1024).toFixed(2)}MB`);
        try {
            if (this.uploadHook) {
                await this.uploadHook.uploadScreenRecording(blob, {
                    sessionId: this.sessionId,
                    onProgress: (progress: number) => {
                        console.log(`Final upload progress: ${progress}%`);
                    }
                });
                console.log('Final recording uploaded successfully via uploadHook');
            }
            else {
                console.log('Using fallback method for final recording upload');
                await this.uploadWithFetch(blob, true);
                console.log('Final recording uploaded successfully via fallback');
            }
            this.recordedChunks = [];
            localStorage.removeItem('failedScreenRecording');
        }
        catch (error) {
            console.error('Failed to upload final recording:', error);
            localStorage.setItem('failedScreenRecording', JSON.stringify({
                sessionId: this.sessionId,
                timestamp: Date.now()
            }));
            addToast({ type: 'error', message: 'Не удалось загрузить запись экрана' });
        }
    }
    private async uploadWithFetch(blob: Blob, isFinal: boolean): Promise<void> {
        const recordingSessionId = sessionManager.getRecordingSessionId() || this.sessionId;
        console.log('uploadWithFetch called with recordingSessionId:', recordingSessionId, 'isFinal:', isFinal);
        if (!recordingSessionId) {
            console.error('Recording session ID is empty - cannot upload. Current sessionId:', this.sessionId);
            throw new Error('Recording session ID is empty - cannot upload');
        }
        const formData = new FormData();
        formData.append('chunk', blob, 'screen_recording.webm');
        formData.append('chunk_index', '0');
        formData.append('is_final', isFinal.toString());
        let attempt = 0;
        while (attempt < RECORDER_CONFIG.UPLOAD_MAX_RETRIES) {
            try {
                const url = `/api/v1/upload/screen-chunk/${recordingSessionId}`;
                console.log('Uploading to URL:', url);
                const response = await fetch(url, {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'Authorization': localStorage.getItem('access_token') ?
                            `Bearer ${localStorage.getItem('access_token')}` : ''
                    }
                });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const result = await response.json();
                console.log('Recording uploaded successfully:', result);
                return;
            }
            catch (error: any) {
                attempt++;
                console.error(`Upload attempt ${attempt} failed:`, error);
                if (attempt >= RECORDER_CONFIG.UPLOAD_MAX_RETRIES) {
                    throw error;
                }
                await new Promise(res => setTimeout(res, 2000 * attempt));
            }
        }
    }
    public getUploadState(): UploadState | null {
        return this.uploadHook?.uploadState || null;
    }
    public updateSessionId(newSessionId: string) {
        if (newSessionId && newSessionId !== this.sessionId) {
            console.log('ScreenRecorderV2: Updating sessionId from', this.sessionId, 'to', newSessionId);
            if (this.isRecording && this.recordedChunks.length > 0) {
                console.log('Saving intermediate recording before sessionId change');
                this.saveIntermediateRecording();
            }
            this.sessionId = newSessionId;
        }
    }
    public getRecordingInfo() {
        return {
            isRecording: this.isRecording,
            chunksCount: this.recordedChunks.length,
            totalSize: this.recordedChunks.reduce((acc, chunk) => acc + chunk.size, 0),
            sessionId: this.sessionId
        };
    }
}

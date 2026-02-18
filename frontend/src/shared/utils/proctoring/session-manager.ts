import { PROCTORING_CONFIG } from './config';
import { addToast } from '../toast';
class SessionManager {
    public currentSessionId: string | null = null;
    public isCurrentSessionPreliminary: boolean = false;
    private originalPreliminarySessionId: string | null = null;
    setCurrent(sessionId: string, isPreliminary: boolean = false) {
        this.currentSessionId = sessionId;
        this.isCurrentSessionPreliminary = isPreliminary;
        if (isPreliminary && !this.originalPreliminarySessionId) {
            this.originalPreliminarySessionId = sessionId;
            console.log('Original preliminary session ID saved:', sessionId);
        }
        console.log('Session ID set:', sessionId, 'isPreliminary:', isPreliminary);
        this.checkForFailedUploads();
    }
    getRecordingSessionId(): string | null {
        return this.originalPreliminarySessionId || this.currentSessionId;
    }
    resetForNewTest() {
        this.currentSessionId = null;
        this.isCurrentSessionPreliminary = false;
        this.originalPreliminarySessionId = null;
        console.log('Session manager reset for new test.');
    }
    private checkForFailedUploads() {
        try {
            const failedUploadStr = localStorage.getItem('failedScreenRecording');
            if (!failedUploadStr)
                return;
            const failedUpload = JSON.parse(failedUploadStr);
            const timeSinceFailure = Date.now() - failedUpload.timestamp;
            if (timeSinceFailure < PROCTORING_CONFIG.FAILED_UPLOAD_RECOVERY_WINDOW_MS && failedUpload.sessionId !== this.currentSessionId) {
                console.log('Found recent failed upload for session:', failedUpload.sessionId);
                addToast({
                    type: 'warning',
                    message: `Обнаружена неудачная загрузка записи экрана для предыдущего теста. Обратитесь к администратору, если это важно.`
                });
            }
            if (timeSinceFailure > PROCTORING_CONFIG.FAILED_UPLOAD_CLEANUP_MS) {
                localStorage.removeItem('failedScreenRecording');
                console.log('Cleaned up old failed upload record.');
            }
        }
        catch (error) {
            console.warn('Error checking for failed uploads:', error);
        }
    }
}
export const sessionManager = new SessionManager();
export let currentSessionId: string | null = null;
export let isCurrentSessionPreliminary: boolean = false;
export function setCurrentSessionId(sessionId: string, isPreliminary: boolean = false) {
    sessionManager.setCurrent(sessionId, isPreliminary);
    currentSessionId = sessionManager.currentSessionId;
    isCurrentSessionPreliminary = sessionManager.isCurrentSessionPreliminary;
}

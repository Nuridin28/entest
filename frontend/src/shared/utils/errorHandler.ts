import { addToast } from './toast';
import { t } from './i18n';
export function handleApiError(error: any, context: string = 'operation'): void {
    console.error(`Error in ${context}:`, error);
    if (error.message?.includes('401') || error.message?.includes('credentials')) {
        addToast({ type: 'error', message: t('authError') });
    }
    else if (error.message?.includes('403')) {
        addToast({ type: 'error', message: t('accessDenied') });
    }
    else if (error.message?.includes('404')) {
        addToast({ type: 'error', message: t('resourceNotFound') });
    }
    else if (error.message?.includes('500')) {
        addToast({ type: 'error', message: t('serverError') });
    }
    else {
        addToast({
            type: 'error',
            message: error.message || t('genericError', { context })
        });
    }
}
export function handleAudioError(error: any, operation: string = 'audio'): void {
    if (error.name === 'AbortError') {
        return;
    }
    console.error(`Audio error in ${operation}:`, error);
    addToast({ type: 'error', message: t('audioPlayError') });
}
export function handleRecordingError(error: any): void {
    console.error('Recording error:', error);
    addToast({ type: 'error', message: t('recordingError') });
}
export function handleUploadError(error: any, fileType: string = 'file'): void {
    console.error(`Upload error for ${fileType}:`, error);
    if (error.message?.includes('timed out')) {
        addToast({
            type: 'error',
            message: t('uploadTimeout', { fileType })
        });
    }
    else if (error.message?.includes('too large')) {
        addToast({
            type: 'error',
            message: t('fileTooLarge', { fileType })
        });
    }
    else if (error.message?.includes('temporarily unavailable')) {
        addToast({
            type: 'error',
            message: t('serverUnavailable')
        });
    }
    else if (error.message?.includes('503')) {
        addToast({
            type: 'error',
            message: t('serverUnavailable')
        });
    }
    else {
        addToast({
            type: 'error',
            message: error.message || t('uploadError', { fileType })
        });
    }
}
export async function withErrorHandling<T>(operation: () => Promise<T>, context: string, customHandler?: (error: any) => void): Promise<T | null> {
    try {
        return await operation();
    }
    catch (error) {
        if (customHandler) {
            customHandler(error);
        }
        else {
            handleApiError(error, context);
        }
        return null;
    }
}

import { useRef, useCallback, useEffect } from 'react';
import { handleAudioError } from '@shared/utils/errorHandler';
interface UseAudioPlayerOptions {
    onAudioEnd?: () => void;
    onAudioError?: (error: any) => void;
    onAudioReady?: () => void;
}
class SimpleAudioManager {
    private audioUrls: Map<string, string> = new Map();
    private audioElements: Map<string, HTMLAudioElement> = new Map();
    getAudioElement(key: string): HTMLAudioElement {
        if (!this.audioElements.has(key)) {
            this.audioElements.set(key, new Audio());
        }
        return this.audioElements.get(key)!;
    }
    createAudioUrl(key: string, blob: Blob): string {
        this.revokeAudioUrl(key);
        const url = URL.createObjectURL(blob);
        this.audioUrls.set(key, url);
        return url;
    }
    revokeAudioUrl(key: string): void {
        const url = this.audioUrls.get(key);
        if (url) {
            URL.revokeObjectURL(url);
            this.audioUrls.delete(key);
        }
    }
    stopAndCleanAudio(key: string): void {
        const audio = this.audioElements.get(key);
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
            audio.src = '';
            audio.oncanplaythrough = null;
            audio.onended = null;
            audio.onerror = null;
        }
        this.revokeAudioUrl(key);
    }
    cleanup(): void {
        this.audioElements.forEach((audio) => {
            audio.pause();
            audio.src = '';
            audio.oncanplaythrough = null;
            audio.onended = null;
            audio.onerror = null;
        });
        this.audioUrls.forEach((url) => {
            URL.revokeObjectURL(url);
        });
        this.audioElements.clear();
        this.audioUrls.clear();
    }
}
export function useAudioPlayer(options: UseAudioPlayerOptions = {}) {
    const audioManagerRef = useRef<SimpleAudioManager>(new SimpleAudioManager());
    const { onAudioEnd, onAudioError, onAudioReady } = options;
    const playAudio = useCallback(async (key: string, audioBlob: Blob): Promise<void> => {
        const manager = audioManagerRef.current;
        const audio = manager.getAudioElement(key);
        const audioUrl = manager.createAudioUrl(key, audioBlob);
        return new Promise((resolve, reject) => {
            let hasResolved = false;
            const cleanup = () => {
                audio.oncanplaythrough = null;
                audio.onloadeddata = null;
                audio.onended = null;
                audio.onerror = null;
            };
            audio.oncanplaythrough = async () => {
                if (hasResolved)
                    return;
                try {
                    onAudioReady?.();
                    await audio.play();
                    hasResolved = true;
                    resolve();
                }
                catch (error) {
                    hasResolved = true;
                    cleanup();
                    reject(error);
                }
            };
            audio.onloadeddata = async () => {
                if (hasResolved)
                    return;
                if (audio.readyState >= 2) {
                    try {
                        onAudioReady?.();
                        await audio.play();
                        hasResolved = true;
                        resolve();
                    }
                    catch (error) {
                        hasResolved = true;
                        cleanup();
                        reject(error);
                    }
                }
            };
            audio.onended = () => {
                onAudioEnd?.();
                manager.revokeAudioUrl(key);
                cleanup();
            };
            audio.onerror = () => {
                if (hasResolved)
                    return;
                hasResolved = true;
                const audioError = new Error('Audio playback failed');
                onAudioError?.(audioError) || handleAudioError(audioError);
                manager.revokeAudioUrl(key);
                cleanup();
                reject(audioError);
            };
            const timeout = setTimeout(() => {
                if (!hasResolved) {
                    hasResolved = true;
                    cleanup();
                    reject(new Error('Audio loading timeout'));
                }
            }, 10000);
            audio.src = audioUrl;
            audio.load();
            const originalResolve = resolve;
            const originalReject = reject;
            resolve = (...args) => {
                clearTimeout(timeout);
                originalResolve(...args);
            };
            reject = (...args) => {
                clearTimeout(timeout);
                originalReject(...args);
            };
        });
    }, [onAudioEnd, onAudioError, onAudioReady]);
    const stopAudio = useCallback((key: string) => {
        audioManagerRef.current.stopAndCleanAudio(key);
    }, []);
    const stopAllAudio = useCallback(() => {
        audioManagerRef.current.cleanup();
    }, []);
    useEffect(() => {
        return () => {
            audioManagerRef.current.cleanup();
        };
    }, []);
    return {
        playAudio,
        stopAudio,
        stopAllAudio
    };
}

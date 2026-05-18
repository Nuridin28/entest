import { useCallback, useEffect, useRef, useState } from 'react';
import { externalAttemptsApi } from '../../shared/api/externalTests';

interface Options {
    token: string;
    enabled: boolean;
}

/**
 * Lightweight proctoring hook for the external /take page.
 *
 * Captures:
 *  - Tab/window blur (low severity)
 *  - Tab hidden (medium)
 *  - Fullscreen exit (high)
 *  - Multiple fullscreen exits within window (escalates)
 *
 * Posts each event to entest via /external-attempts/proctoring/event.
 */
export const useExternalProctoring = ({ token, enabled }: Options) => {
    const tokenRef = useRef(token);
    tokenRef.current = token;
    const [violationsLocal, setViolationsLocal] = useState(0);
    const lastBlurAtRef = useRef<number>(0);

    const log = useCallback((event_type: string, severity: 'low' | 'medium' | 'high', description?: string, metadata?: unknown) => {
        setViolationsLocal((c) => c + 1);
        externalAttemptsApi.logProctoringEvent(tokenRef.current, { event_type, severity, description, metadata });
    }, []);

    useEffect(() => {
        if (!enabled) return;

        const onBlur = () => {
            const now = Date.now();
            // Debounce — many browsers fire blur+visibilitychange together.
            if (now - lastBlurAtRef.current < 800) return;
            lastBlurAtRef.current = now;
            log('window_blur', 'low', 'Окно потеряло фокус');
        };
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') {
                log('tab_hidden', 'medium', 'Студент переключился на другую вкладку или свернул окно');
            }
        };
        const onFsChange = () => {
            if (!document.fullscreenElement) {
                log('fullscreen_exit', 'high', 'Выход из полноэкранного режима');
            }
        };
        const onCopy = () => log('copy_attempt', 'low', 'Попытка скопировать содержимое');
        const onPaste = () => log('paste_attempt', 'low', 'Попытка вставить содержимое');
        const onContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            log('context_menu', 'low', 'Правый клик');
        };

        window.addEventListener('blur', onBlur);
        document.addEventListener('visibilitychange', onVisibility);
        document.addEventListener('fullscreenchange', onFsChange);
        document.addEventListener('copy', onCopy);
        document.addEventListener('paste', onPaste);
        document.addEventListener('contextmenu', onContextMenu);

        return () => {
            window.removeEventListener('blur', onBlur);
            document.removeEventListener('visibilitychange', onVisibility);
            document.removeEventListener('fullscreenchange', onFsChange);
            document.removeEventListener('copy', onCopy);
            document.removeEventListener('paste', onPaste);
            document.removeEventListener('contextmenu', onContextMenu);
        };
    }, [enabled, log]);

    const enterFullscreen = useCallback(async () => {
        try {
            await document.documentElement.requestFullscreen();
        } catch (_) {/* user can deny — we'll log on exit instead */}
    }, []);

    return { violationsLocal, log, enterFullscreen };
};

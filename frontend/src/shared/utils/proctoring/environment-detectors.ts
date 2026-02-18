import { VIOLATION_TYPES } from './config';
export function initializeEnvironmentDetectors(onViolation: (type: string, metadata?: object) => void) {
    const listeners: {
        type: string;
        handler: (e: any) => void;
        target: EventTarget;
    }[] = [];
    const addListener = (target: EventTarget, type: string, handler: (e: any) => void) => {
        target.addEventListener(type, handler);
        listeners.push({ target, type, handler });
    };
    addListener(document, 'visibilitychange', () => {
        if (document.hidden)
            onViolation(VIOLATION_TYPES.TAB_SWITCHED, { forceCount: true });
        else
            onViolation(VIOLATION_TYPES.TAB_RETURNED);
    });
    addListener(window, 'blur', () => onViolation(VIOLATION_TYPES.WINDOW_LOST_FOCUS));
    addListener(window, 'focus', () => onViolation(VIOLATION_TYPES.WINDOW_GAINED_FOCUS));
    const checkDevTools = () => {
        const threshold = 200;
        if (window.outerWidth - window.innerWidth > threshold ||
            window.outerHeight - window.innerHeight > threshold) {
            onViolation(VIOLATION_TYPES.DEVTOOLS_OPENED);
            return;
        }
        const element = new Image();
        Object.defineProperty(element, 'id', {
            get: function () {
                onViolation(VIOLATION_TYPES.DEVTOOLS_OPENED);
                return '';
            }
        });
        console.log(element);
    };
    const devToolsInterval = setInterval(checkDevTools, 2000);
    addListener(window, 'keydown', (e: KeyboardEvent) => {
        const isSuspicious = e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase()));
        if (isSuspicious) {
            e.preventDefault();
            onViolation(VIOLATION_TYPES.SUSPICIOUS_HOTKEY, { key: e.key });
        }
    });
    addListener(document, 'contextmenu', (e: MouseEvent) => {
        e.preventDefault();
        onViolation('right_click_blocked');
    });
    addListener(document, 'copy', () => onViolation(VIOLATION_TYPES.TEXT_COPIED));
    addListener(document, 'paste', () => onViolation(VIOLATION_TYPES.TEXT_PASTED));
    return () => {
        clearInterval(devToolsInterval);
        listeners.forEach(({ target, type, handler }) => target.removeEventListener(type, handler));
        console.log('Environment detectors cleaned up.');
    };
}

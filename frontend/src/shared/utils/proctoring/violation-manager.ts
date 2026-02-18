import React from 'react';
import { PROCTORING_CONFIG, VIOLATION_TYPES } from './config';
import type { ProctoringState } from './types';
import { sessionManager } from './session-manager';
import { proctoringApi } from '@shared/api/api';
import { addToast } from '../toast';
import { t } from '../i18n';
export class ViolationManager {
    private setProctoringState: React.Dispatch<React.SetStateAction<ProctoringState>>;
    private lastToastTimeMap = new Map<string, number>();
    private FATAL_VIOLATIONS = [
        VIOLATION_TYPES.SCREEN_SHARE_STOPPED,
        VIOLATION_TYPES.SCREEN_SHARE_DENIED,
        VIOLATION_TYPES.CAMERA_ACCESS_DENIED,
        VIOLATION_TYPES.TAB_SWITCHED,
    ];
    constructor(setProctoringState: React.Dispatch<React.SetStateAction<ProctoringState>>) {
        this.setProctoringState = setProctoringState;
    }
    private getSeverity(type: string): 'critical' | 'high' | 'medium' | 'low' | 'log_only' {
        const critical = [
            VIOLATION_TYPES.DEVTOOLS_DEBUGGER, VIOLATION_TYPES.TAB_SWITCHED,
            VIOLATION_TYPES.MULTIPLE_VIOLATIONS, VIOLATION_TYPES.SCREEN_SHARE_STOPPED,
            VIOLATION_TYPES.FULLSCREEN_EXITED, VIOLATION_TYPES.WINDOW_LOST_FOCUS,
            VIOLATION_TYPES.SUSPICIOUS_HOTKEY, VIOLATION_TYPES.NO_FACE,
            VIOLATION_TYPES.MULTIPLE_FACES, VIOLATION_TYPES.DEVTOOLS_OPENED,
            VIOLATION_TYPES.CAMERA_ACCESS_DENIED, VIOLATION_TYPES.SCREEN_SHARE_DENIED,
        ];
        const high = [VIOLATION_TYPES.HEAD_TURNED, VIOLATION_TYPES.LOOKING_AWAY, VIOLATION_TYPES.EYES_CLOSED];
        const logOnly = [VIOLATION_TYPES.TEXT_COPIED, VIOLATION_TYPES.TEXT_PASTED];
        if (critical.includes(type as any))
            return 'critical';
        if (high.includes(type as any))
            return 'high';
        if (logOnly.includes(type as any))
            return 'log_only';
        return 'medium';
    }
    public log = async (type: string, metadata: object = {}) => {
        const activeSessionId = sessionManager.currentSessionId;
        if (!activeSessionId) {
            console.warn(`Cannot log violation "${type}", no active session.`);
            return;
        }
        console.warn(`[VIOLATION] ${type}`, metadata);
        const severity = this.getSeverity(type);
        if (severity === 'log_only') {
            proctoringApi.logEvent({
                session_id: activeSessionId,
                violation_type: type,
                severity,
                description: `Logged event: ${type}`,
                violation_metadata: metadata,
            }).catch(e => console.error("Failed to log event:", e));
            return;
        }
        const isFatal = this.FATAL_VIOLATIONS.includes(type as any);
        this.setProctoringState(prev => {
            if (prev.isTestTerminated)
                return prev;
            const newCount = prev.violationCount + 1;
            const shouldTerminate = isFatal || newCount >= PROCTORING_CONFIG.MAX_VIOLATIONS_ALLOWED;
            if (shouldTerminate) {
                const message = isFatal ? 'Тест завершен из-за критического нарушения!' : t('testTerminatedViolations');
                addToast({ type: 'error', message });
                return { ...prev, violationCount: newCount, isTestTerminated: true };
            }
            return { ...prev, violationCount: newCount };
        });
        proctoringApi.logEvent({
            session_id: activeSessionId,
            violation_type: type,
            severity,
            description: `Violation: ${type}`,
            violation_metadata: metadata,
        }).catch(e => console.error("Failed to log violation:", e));
        const now = Date.now();
        const lastToastTime = this.lastToastTimeMap.get(type) || 0;
        if (now - lastToastTime > PROCTORING_CONFIG.TOAST_COOLDOWN_MS) {
            let message = '';
            let toastType: 'error' | 'warning' = 'warning';
            switch (type) {
                case VIOLATION_TYPES.TAB_SWITCHED:
                    message = t('tabSwitchedToast');
                    toastType = 'error';
                    break;
                case VIOLATION_TYPES.FULLSCREEN_EXITED:
                    message = t('fullscreenExitedToast');
                    toastType = 'error';
                    break;
                case VIOLATION_TYPES.DEVTOOLS_OPENED:
                    message = t('devtoolsOpenedToast');
                    toastType = 'error';
                    break;
                case VIOLATION_TYPES.NO_FACE:
                    message = t('noFaceDetectedToast');
                    toastType = 'error';
                    break;
                case VIOLATION_TYPES.MULTIPLE_FACES:
                    message = t('multipleFacesDetectedToast');
                    toastType = 'error';
                    break;
                case VIOLATION_TYPES.SCREEN_SHARE_STOPPED:
                    message = t('screenShareStoppedToast');
                    toastType = 'error';
                    break;
                case VIOLATION_TYPES.WINDOW_LOST_FOCUS:
                    message = t('windowLostFocusToast');
                    break;
                case VIOLATION_TYPES.HEAD_TURNED:
                    message = t('headTurnedToast');
                    break;
                case VIOLATION_TYPES.LOOKING_AWAY:
                    message = t('lookingAwayToast');
                    break;
                case VIOLATION_TYPES.EYES_CLOSED:
                    message = t('eyesClosedToast');
                    break;
            }
            if (message) {
                addToast({ type: toastType, message });
                this.lastToastTimeMap.set(type, now);
            }
        }
    };
}

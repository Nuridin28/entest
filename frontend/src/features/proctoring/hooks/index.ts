import { useState, useCallback } from 'react';
import type { ProctoringSession, Violation } from '../types';
export function useProctoring() {
    const [session, setSession] = useState<ProctoringSession | null>(null);
    const [violations, setViolations] = useState<Violation[]>([]);
    const [isActive, setIsActive] = useState(false);
    const startSession = useCallback(async (testId: string) => {
        try {
            const newSession = {
                id: 'session-' + Date.now(),
                user_id: 'user-1',
                test_id: testId,
                started_at: new Date().toISOString(),
                violations: [],
                status: 'active' as const
            };
            setSession(newSession);
            setIsActive(true);
            return newSession;
        }
        catch (error) {
            console.error('Failed to start proctoring session:', error);
            throw error;
        }
    }, []);
    const endSession = useCallback(async () => {
        if (!session)
            return;
        try {
            setSession(null);
            setIsActive(false);
        }
        catch (error) {
            console.error('Failed to end proctoring session:', error);
            throw error;
        }
    }, [session]);
    const logViolation = useCallback(async (violation: Omit<Violation, 'id' | 'session_id'>) => {
        if (!session)
            return;
        try {
            const newViolation = {
                id: 'violation-' + Date.now(),
                session_id: session.id,
                ...violation,
                timestamp: new Date().toISOString()
            };
            setViolations(prev => [...prev, newViolation]);
            return newViolation;
        }
        catch (error) {
            console.error('Failed to log violation:', error);
            throw error;
        }
    }, [session]);
    return {
        session,
        violations,
        isActive,
        startSession,
        endSession,
        logViolation
    };
}
export function useViolationTracking() {
    const [violations, setViolations] = useState<Violation[]>([]);
    const addViolation = useCallback((violation: Violation) => {
        setViolations(prev => [...prev, violation]);
    }, []);
    const clearViolations = useCallback(() => {
        setViolations([]);
    }, []);
    return {
        violations,
        addViolation,
        clearViolations
    };
}

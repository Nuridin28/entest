import { useState, useCallback } from 'react';
import { preliminaryTestApi, testApi } from '@shared/api/api';
export type TestMode = 'preliminary' | 'main';
export function useTestAnnulment(logCheatingEvent: (type: string, metadata?: object) => void, setIsTestActive: React.Dispatch<React.SetStateAction<boolean>>, cleanupProctoring: () => void, pauseProctoringSession: () => void, saveCurrentRecording: () => Promise<void>, testMode: TestMode, preliminarySessionId: number | null, mainSessionId: string | null) {
    const [isTestAnnulled, setIsTestAnnulled] = useState(false);
    const [annulmentReason, setAnnulmentReason] = useState('');
    const annulTest = useCallback(async (reason: string) => {
        if (isTestAnnulled)
            return;
        console.log('Annulling test:', reason);
        console.log('Saving screen recording before test annulment...');
        saveCurrentRecording();
        logCheatingEvent('test_annulled', { reason });
        setIsTestAnnulled(true);
        setAnnulmentReason(reason);
        setIsTestActive(false);
        cleanupProctoring();
        pauseProctoringSession();
        try {
            if (testMode === 'preliminary' && preliminarySessionId) {
                await preliminaryTestApi.annulTest(preliminarySessionId);
            }
            else if (testMode === 'main' && mainSessionId) {
                await testApi.annulTest(mainSessionId);
            }
        }
        catch (error) {
            console.error('Failed to annul test in backend:', error);
        }
    }, [
        isTestAnnulled, logCheatingEvent, setIsTestActive, cleanupProctoring,
        pauseProctoringSession, saveCurrentRecording, testMode,
        preliminarySessionId, mainSessionId
    ]);
    return { isTestAnnulled, annulmentReason, annulTest };
}

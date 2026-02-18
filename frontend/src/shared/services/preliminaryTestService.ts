import { preliminaryTestApi } from '@shared/api/api';
import { addToast } from '@shared/utils/toast';
import { t } from '@shared/utils/i18n';
import { setCurrentSessionId } from '@shared/utils/proctoring';
import { UI_CONSTANTS } from '@shared/utils/testConstants';
import type { TestLevel } from '@shared/hooks/usePreliminaryTest';
class PreliminaryTestService {
    private isStarting = false;
    async startTest(setPreliminarySessionId: (id: number) => void, setTestResultId: (id: number) => void, setPreliminaryTestStatus: (status: string) => void, generateLevelTest: (sessionId: number, level: TestLevel) => Promise<void>, startTimer: () => void) {
        if (this.isStarting) {
            console.log('PreliminaryTestService.startTest already in progress, skipping');
            return;
        }
        try {
            this.isStarting = true;
            console.log('PreliminaryTestService.startTest called');
            setPreliminaryTestStatus('loading');
            const response = await preliminaryTestApi.startPreliminaryTest();
            const sessionId = response.session_id;
            const resultId = response.test_result_id;
            setPreliminarySessionId(sessionId);
            setTestResultId(resultId);
            console.log('Setting current session ID for proctoring:', sessionId);
            setCurrentSessionId(String(sessionId), true);
            await generateLevelTest(sessionId, 'pre_intermediate');
            startTimer();
        }
        catch (err: any) {
            console.error('Failed to start preliminary test:', err);
            addToast({ type: 'error', message: t('preliminaryTestStartError') });
            setPreliminaryTestStatus('error');
        }
        finally {
            this.isStarting = false;
        }
    }
    async completeTest(sessionId: number) {
        try {
            const result = await preliminaryTestApi.completeTest(sessionId);
            return result;
        }
        catch (err: any) {
            console.error('Failed to complete test:', err);
            addToast({ type: 'error', message: t('testCompletionError') });
            throw err;
        }
    }
    async handleTestResult(result: any, generateLevelTest: (sessionId: number, level: TestLevel) => Promise<void>, preliminarySessionId: number, createMainTest: () => Promise<void>, handleElementaryLevelCompletion: (level: string) => Promise<void>, handleAdvancedLevelTransition: () => Promise<void>) {
        if (!result || !result.next_action) {
            console.error('Invalid preliminary test result:', result);
            return;
        }
        const { next_action } = result;
        if (next_action.action === 'continue_test') {
            const nextLevel = next_action.next_level as TestLevel;
            console.log('Automatically continuing to next level:', nextLevel);
            setTimeout(() => {
                generateLevelTest(preliminarySessionId, nextLevel);
            }, UI_CONSTANTS.PRELIMINARY_RESULTS_DELAY);
        }
        else if (next_action.action === 'ai_test') {
            await createMainTest();
        }
        else if (next_action.action === 'set_level') {
            await this.handleLevelDetermination(next_action.level, handleElementaryLevelCompletion, handleAdvancedLevelTransition);
        }
    }
    private async handleLevelDetermination(level: string, handleElementaryLevelCompletion: (level: string) => Promise<void>, handleAdvancedLevelTransition: () => Promise<void>) {
        console.log('Final level determined:', level);
        if (!level) {
            console.error('Level is not defined, falling back to advanced level transition');
            await handleAdvancedLevelTransition();
            return;
        }
        if (level === 'A1' || level === 'A2') {
            await handleElementaryLevelCompletion(level);
        }
        else {
            await handleAdvancedLevelTransition();
        }
    }
}
export const preliminaryTestService = new PreliminaryTestService();

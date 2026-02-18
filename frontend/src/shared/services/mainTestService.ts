import { preliminaryTestApi, testApi } from '@shared/api/api';
import { addToast } from '@shared/utils/toast';
import { t } from '@shared/utils/i18n';
export class MainTestService {
    async createTest(preliminarySessionId: number, setMainSessionId: (id: string) => void, setTestResultId: (id: number) => void, setTestMode: (mode: string) => void, requestFullscreenProgrammatically: () => Promise<void>) {
        try {
            const response = await preliminaryTestApi.createMainTest(preliminarySessionId);
            const mainTestSessionId = response.main_test_session_id;
            const resultId = response.test_result_id;
            console.log('Transitioning from preliminary test to main test:', {
                preliminarySessionId,
                mainTestSessionId,
                testResultId: resultId
            });
            setMainSessionId(mainTestSessionId);
            setTestResultId(resultId);
            setTestMode('main');
            setTimeout(() => {
                if (!document.fullscreenElement) {
                    console.log('Restoring fullscreen after main test creation');
                    requestFullscreenProgrammatically();
                }
            }, 1000);
        }
        catch (err: any) {
            console.error('Failed to create main test:', err);
            addToast({ type: 'error', message: t('mainTestCreationError') });
            throw err;
        }
    }
    async generateTest(mainSessionId: string, level: string, setMainTestData: (data: any) => void, setMainTestStatus: (status: string) => void, setIsGeneratingTest: (generating: boolean) => void, setCurrentSection: (section: string) => void) {
        try {
            const data = await testApi.generateFullTest(mainSessionId, level || 'B1');
            if (data.status === 'generating') {
                setMainTestStatus('loading');
                setIsGeneratingTest(true);
                console.log('Test generation in background - keeping transition state active');
                return { isGenerating: true };
            }
            if (level === 'A1' || level === 'A2') {
                console.log('Elementary level detected, skipping to results');
                setCurrentSection('completed');
                try {
                    const testResults = await testApi.getTestResults(mainSessionId);
                    return { testResults, isElementary: true };
                }
                catch (err) {
                    console.error('Failed to get elementary level test results:', err);
                    return { isElementary: true };
                }
            }
            setMainTestData(data);
            return { testData: data };
        }
        catch (err: any) {
            addToast({ type: 'error', message: t('testGenerationError', { message: err.message }) });
            throw err;
        }
    }
    async completeTest(mainSessionId: string, saveFinalRecording: () => Promise<void>) {
        try {
            console.log('Saving screen recording before test completion...');
            try {
                await saveFinalRecording();
                console.log('Screen recording saved successfully');
            }
            catch (recordingError) {
                console.error('Failed to save screen recording:', recordingError);
            }
            await testApi.completeTest(mainSessionId);
            const testResults = await testApi.getTestResults(mainSessionId);
            return testResults;
        }
        catch (err: any) {
            addToast({ type: 'error', message: err.message || t('testCompletionError') });
            throw err;
        }
    }
    async fetchTestGeneration(mainSessionId: string) {
        try {
            const session = await testApi.getSession(mainSessionId);
            if (session.status === 'ready') {
                const [reading, listening, writing, speaking] = await Promise.all([
                    testApi.getQuestionsByType(mainSessionId, 'reading').catch(() => null),
                    testApi.getQuestionsByType(mainSessionId, 'listening').catch(() => null),
                    testApi.getQuestionsByType(mainSessionId, 'writing').catch(() => null),
                    testApi.getQuestionsByType(mainSessionId, 'speaking').catch(() => null)
                ]);
                const processedSpeaking = speaking?.map((q: any) => {
                    if (q.content && typeof q.content === 'string') {
                        try {
                            return { ...q, ...JSON.parse(q.content) };
                        }
                        catch (error) {
                            console.error('Error parsing speaking question content:', error);
                            return q;
                        }
                    }
                    return q;
                }) || [];
                const testData = {
                    reading: { questions: reading?.questions || [], passage: reading?.passage || '' },
                    listening: { scenarios: listening || [] },
                    writing: { prompts: writing || [] },
                    speaking: { questions: processedSpeaking }
                };
                const hasQuestions = Object.entries(testData).some(([key, section]) => {
                    if (key === 'reading' && 'questions' in section) {
                        return Array.isArray(section.questions) && section.questions.length > 0;
                    }
                    if (key === 'listening' && 'scenarios' in section) {
                        return Array.isArray(section.scenarios) && section.scenarios.length > 0;
                    }
                    if (key === 'writing' && 'prompts' in section) {
                        return Array.isArray(section.prompts) && section.prompts.length > 0;
                    }
                    if (key === 'speaking' && 'questions' in section) {
                        return Array.isArray(section.questions) && section.questions.length > 0;
                    }
                    return false;
                });
                if (!hasQuestions) {
                    console.error('No questions found for any section');
                    throw new Error('No test questions were generated');
                }
                return testData;
            }
            return null;
        }
        catch (err: any) {
            console.error('Failed to fetch generated test:', err);
            throw err;
        }
    }
}

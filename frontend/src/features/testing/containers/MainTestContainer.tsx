import { ReadingTest, ListeningTest, WritingTest, SpeakingTest } from '@features/testing/main-test';
import { CompleteTestResults, UnifiedTestResults } from '@features/testing/results';
import { TestProgressBar } from '@shared/components/feedback/TestProgressBar';
import { TestGenerationStatus } from '../shared/components';
import { testApi } from '@shared/api/api';
import { t } from '@shared/utils/i18n';
import type { TestSection } from '@shared/hooks/useMainTest';
interface MainTestContainerProps {
    mainSessionId: string | null;
    currentSection: TestSection;
    mainTestData: any;
    mainTestResults: any;
    isGeneratingTest: boolean;
    timeRemaining: number;
    testResultId: number | null;
    preliminaryTestResult: any;
    onSectionComplete: (section: TestSection, allQuestionsAnswered: boolean) => void;
    onTestGenerationComplete: () => void;
    onTestGenerationError: (error: string) => void;
    onTestComplete: () => void;
    setMainTestData: (data: any) => void;
    proceedToNextSection: (section: TestSection) => void;
}
export function MainTestContainer({ mainSessionId, currentSection, mainTestData, mainTestResults, isGeneratingTest, timeRemaining, testResultId, preliminaryTestResult, onSectionComplete, onTestGenerationComplete, onTestGenerationError, onTestComplete, setMainTestData, proceedToNextSection, }: MainTestContainerProps) {
    if (isGeneratingTest && mainSessionId) {
        return (<TestGenerationStatus sessionId={mainSessionId} onComplete={onTestGenerationComplete} onError={onTestGenerationError}/>);
    }
    const renderProgressBar = () => {
        if (currentSection === 'completed')
            return null;
        const sections = ['reading', 'listening', 'writing', 'speaking'];
        const currentIndex = sections.indexOf(currentSection);
        const progress = ((currentIndex + 1) / sections.length) * 100;
        return (<>
                <TestProgressBar progress={progress} timeRemaining={timeRemaining} showTimer={true}/>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {t(`${currentSection}Section`)}
                </p>
            </>);
    };
    const fetchQuestionsByType = async (type: string) => {
        if (!mainSessionId)
            return null;
        try {
            return await testApi.getQuestionsByType(mainSessionId, type);
        }
        catch (error) {
            console.error(`Failed to fetch ${type} questions directly:`, error);
            return null;
        }
    };
    const renderCurrentSection = () => {
        if (!mainTestData && currentSection !== 'completed') {
            return <div className="text-red-500">{t('testDataError')}</div>;
        }
        switch (currentSection) {
            case 'reading': {
                if (!mainTestData?.reading?.questions || mainTestData.reading.questions.length === 0) {
                    if (mainSessionId) {
                        fetchQuestionsByType('reading').then(reading => {
                            if (reading?.questions?.length > 0) {
                                setMainTestData((prev: any) => ({
                                    ...prev,
                                    reading: { questions: reading.questions, passage: reading.passage || '' }
                                }));
                            }
                        });
                    }
                    return <div className="text-red-500">Reading test data not available</div>;
                }
                return (<ReadingTest sessionId={mainSessionId!} onComplete={(answered: boolean) => onSectionComplete('reading', answered)} questions={mainTestData.reading.questions} passage={mainTestData.reading.passage || ''}/>);
            }
            case 'listening': {
                if (!mainTestData?.listening?.scenarios || mainTestData.listening.scenarios.length === 0) {
                    if (mainSessionId) {
                        fetchQuestionsByType('listening').then(listening => {
                            if (listening?.length > 0) {
                                setMainTestData((prev: any) => ({
                                    ...prev,
                                    listening: { scenarios: listening }
                                }));
                            }
                            else {
                                setTimeout(() => proceedToNextSection('listening'), 100);
                            }
                        });
                    }
                    else {
                        setTimeout(() => proceedToNextSection('listening'), 2000);
                    }
                    return null;
                }
                return (<ListeningTest sessionId={mainSessionId!} onComplete={(answered: boolean) => onSectionComplete('listening', answered)} scenarios={mainTestData.listening.scenarios}/>);
            }
            case 'writing': {
                if (!mainTestData?.writing?.prompts || mainTestData.writing.prompts.length === 0) {
                    if (mainSessionId) {
                        fetchQuestionsByType('writing').then(writing => {
                            if (writing?.length > 0) {
                                setMainTestData((prev: any) => ({
                                    ...prev,
                                    writing: { prompts: writing }
                                }));
                            }
                            else {
                                setTimeout(() => proceedToNextSection('writing'), 100);
                            }
                        });
                    }
                    else {
                        setTimeout(() => proceedToNextSection('writing'), 2000);
                    }
                    return null;
                }
                return (<WritingTest sessionId={mainSessionId!} level={preliminaryTestResult?.next_action?.level || "B1"} onComplete={(answered: boolean) => onSectionComplete('writing', answered)} prompts={mainTestData.writing.prompts}/>);
            }
            case 'speaking': {
                if (!mainTestData?.speaking?.questions || mainTestData.speaking.questions.length === 0) {
                    if (mainSessionId) {
                        fetchQuestionsByType('speaking').then(speaking => {
                            if (speaking?.length > 0) {
                                const processedSpeaking = speaking.map((q: any) => {
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
                                });
                                setMainTestData((prev: any) => ({
                                    ...prev,
                                    speaking: { questions: processedSpeaking }
                                }));
                            }
                            else {
                                setTimeout(() => proceedToNextSection('speaking'), 100);
                            }
                        });
                    }
                    else {
                        setTimeout(() => proceedToNextSection('speaking'), 2000);
                    }
                    return null;
                }
                return (<SpeakingTest sessionId={mainSessionId!} onComplete={(answered: boolean) => onSectionComplete('speaking', answered)} questions={mainTestData.speaking.questions}/>);
            }
            case 'completed': {
                if (testResultId) {
                    return <UnifiedTestResults testResultId={testResultId} onReturnHome={onTestComplete}/>;
                }
                else if (mainSessionId) {
                    return <CompleteTestResults mainTestId={mainSessionId} onReturnHome={onTestComplete}/>;
                }
                else {
                    return <CompleteTestResults mainResults={mainTestResults} onReturnHome={onTestComplete}/>;
                }
            }
            default:
                return <div className="text-red-500">{t('unknownSectionError')}</div>;
        }
    };
    return (<div className="w-full">
            {renderProgressBar()}
            {renderCurrentSection()}
        </div>);
}

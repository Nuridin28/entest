import { GrammarQuestion, VocabularyQuestion, ReadingQuestion } from '@features/testing/preliminary';
import { TestResults as PreliminaryTestResults } from '@features/testing/preliminary';
import { TestProgressBar } from '@shared/components/feedback/TestProgressBar';
import { t } from '@shared/utils/i18n';
import type { TestStatus } from '@shared/hooks/usePreliminaryTest';
interface PreliminaryTestContainerProps {
    preliminaryTestStatus: TestStatus;
    preliminaryTestData: any;
    allQuestions: any[];
    currentQuestionIndex: number;
    answers: Record<number, string>;
    timeRemaining: number;
    preliminaryTestResult: any;
    onAnswerSubmit: (answer: string) => void;
    onPrevious: () => void;
    onNext: () => void;
    onContinue: () => void;
    onFinish: () => void;
    onLogout: () => void;
}
export function PreliminaryTestContainer({ preliminaryTestStatus, preliminaryTestData, allQuestions, currentQuestionIndex, answers, timeRemaining, preliminaryTestResult, onAnswerSubmit, onPrevious, onNext, onContinue, onFinish, onLogout, }: PreliminaryTestContainerProps) {
    if (preliminaryTestStatus === 'loading' || preliminaryTestStatus === 'starting') {
        return (<div className="flex items-center justify-center p-4">
                <div className="flex items-center space-x-3">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"/>
                    <span className="text-gray-700">{t('preparingTest')}</span>
                </div>
            </div>);
    }
    if (preliminaryTestStatus === 'error') {
        return (<div className="flex flex-col items-center justify-center h-full">
                <div className="text-xl font-semibold text-red-600 mb-4">{t('testError')}</div>
                <button onClick={onLogout} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 sm:px-6 rounded-lg shadow-md transition duration-300 text-sm sm:text-base min-w-0">
                    <span className="truncate">{t('returnHome')}</span>
                </button>
            </div>);
    }
    if (preliminaryTestStatus === 'completed' && preliminaryTestResult) {
        if (preliminaryTestResult.next_action?.action === 'ai_test') {
            return (<div className="flex flex-col items-center justify-center h-full">
                    <div className="text-xl font-semibold">{t('generatingAiTest')}</div>
                    <div className="w-1/2 bg-gray-200 rounded-full h-4 mt-4">
                        <div className="bg-blue-600 h-4 rounded-full animate-pulse"/>
                    </div>
                </div>);
        }
        return (<PreliminaryTestResults results={preliminaryTestResult} onContinue={onContinue} onFinish={onFinish}/>);
    }
    if (!preliminaryTestData || allQuestions.length === 0) {
        return <div className="text-red-500">{t('testDataError')}</div>;
    }
    const currentQuestion = allQuestions[currentQuestionIndex];
    if (!currentQuestion) {
        return <div className="text-red-500">{t('questionNotFound')}</div>;
    }
    const questionId = currentQuestion.id;
    const userAnswer = answers[questionId] || '';
    const progress = ((currentQuestionIndex + 1) / allQuestions.length) * 100;
    const questionProps = {
        question: currentQuestion.data,
        userAnswer,
        onSubmit: onAnswerSubmit,
        currentQuestionIndex,
        totalQuestions: allQuestions.length,
        onPrevious,
        onNext: userAnswer ? onNext : undefined,
        canGoNext: !!userAnswer,
    };
    return (<div className="w-full">
            
            <TestProgressBar progress={progress} timeRemaining={timeRemaining} showTimer={true}/>
            
            
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {t('questionCounter', {
            current: currentQuestionIndex + 1,
            total: allQuestions.length
        })}
            </p>

            
            {(() => {
            switch (currentQuestion.category) {
                case 'grammar':
                    return <GrammarQuestion {...questionProps}/>;
                case 'vocabulary':
                    return <VocabularyQuestion {...questionProps}/>;
                case 'reading':
                    return <ReadingQuestion {...questionProps}/>;
                default:
                    return <div className="text-red-500">{t('unknownQuestionType')}</div>;
            }
        })()}
        </div>);
}

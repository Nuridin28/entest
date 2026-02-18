import React, { useEffect } from 'react';
import { t } from '@shared/utils/i18n';
import { AnswerOptions } from '@shared/components/forms/AnswerOptions';
import { TrueFalseOptions } from '@shared/components/forms/TrueFalseOptions';
interface ReadingQuestionProps {
    question: {
        text: string;
        question: {
            id: number;
            statement: string;
            correct_answer: string;
            options?: Record<string, string>;
        };
    };
    userAnswer: string;
    onSubmit: (answer: string) => void;
    currentQuestionIndex?: number;
    totalQuestions?: number;
    onPrevious?: () => void;
    onNext?: () => void;
    canGoNext?: boolean;
}
const ReadingQuestion: React.FC<ReadingQuestionProps> = ({ question, userAnswer, onSubmit, currentQuestionIndex = 0, totalQuestions = 0, onPrevious, onNext, canGoNext = false }) => {
    useEffect(() => {
        const handleKeyPress = (event: KeyboardEvent) => {
            if (event.key === 'Enter' && userAnswer && canGoNext && onNext) {
                event.preventDefault();
                onNext();
            }
        };
        document.addEventListener('keydown', handleKeyPress);
        return () => {
            document.removeEventListener('keydown', handleKeyPress);
        };
    }, [userAnswer, canGoNext, onNext]);
    if (!question || !question.text || !question.question || !question.question.statement) {
        console.error("Invalid question data:", question);
        return (<div className="w-full max-w-3xl bg-white p-6 rounded-lg shadow-md">
                <div className="text-red-500">Error: Invalid question data</div>
            </div>);
    }
    const hasOptions = question.question.options && Object.keys(question.question.options).length > 0;
    return (<div className="w-full max-w-3xl bg-white p-6 rounded-lg shadow-md">
            <div className="mb-2 text-sm text-purple-600 font-medium">{t('reading')}</div>

            {totalQuestions > 0 && (<div className="mb-4 text-sm text-gray-500">
                    {t('questionCounter', { current: currentQuestionIndex + 1, total: totalQuestions })}
                </div>)}

            <div className="bg-gray-50 p-4 mb-6 rounded-lg border border-gray-200 max-h-80 overflow-y-auto">
                <p className="text-gray-800 whitespace-pre-line">{question.text}</p>
            </div>

            <h3 className="text-lg font-semibold mb-4 text-gray-800">{question.question.statement}</h3>

            {hasOptions ? (<AnswerOptions options={question.question.options || {}} selectedAnswer={userAnswer} onSelect={onSubmit} name={`reading-question-${currentQuestionIndex}`} className="mb-6"/>) : (<TrueFalseOptions selectedAnswer={userAnswer} onSelect={onSubmit} name={`reading-question-${currentQuestionIndex}`} className="mb-6"/>)}

            <div className="flex justify-between items-center">
                {onPrevious && (<button onClick={onPrevious} disabled={currentQuestionIndex === 0} className={`px-4 py-2 rounded-lg font-medium transition-colors ${currentQuestionIndex === 0
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gray-500 text-white hover:bg-gray-600'}`}>
                        {t('back')}
                    </button>)}

                <div className="text-sm text-gray-500">
                    {userAnswer ? (<span>
                            {t('answerSelected')}
                            {canGoNext && onNext && (<span className="ml-2 text-blue-500">
                                    • {t('pressEnterToContinue')}
                                </span>)}
                        </span>) : (t('selectAnswer'))}
                </div>

                {onNext && (<button onClick={onNext} disabled={!canGoNext} className={`px-4 py-2 rounded-lg font-medium transition-colors ${!canGoNext
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                        {currentQuestionIndex === totalQuestions - 1 ? t('finish') : t('forward')}
                    </button>)}
            </div>
        </div>);
};
export default ReadingQuestion;

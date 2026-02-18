import React, { useEffect } from 'react';
import { t } from '@shared/utils/i18n';
import { AnswerOptions } from './forms/AnswerOptions';
function formatQuestionText(text: string): React.ReactElement {
    const formattedText = text.replace(/\\n/g, '\n');
    const lines = formattedText.split('\n');
    if (lines.length > 1) {
        return (<div>
        {lines.map((line, index) => (<div key={index} className={index < lines.length - 1 ? "block mb-3" : "block"}>
            {line.trim()}
          </div>))}
      </div>);
    }
    const instructionPattern = /^Choose the correct (?:answer|option)(?:: A, B, C, or D)?\.?\s*/i;
    if (instructionPattern.test(text)) {
        const match = text.match(instructionPattern);
        if (match) {
            const instruction = match[0].trim();
            const questionText = text.substring(match[0].length).trim();
            return (<div>
          <div className="block mb-3">
            {instruction}
          </div>
          <div className="block">
            {questionText}
          </div>
        </div>);
        }
    }
    return <span className="whitespace-pre-wrap">{text}</span>;
}
interface PreliminaryQuestionProps {
    question: {
        question: string;
        options: Record<string, string>;
    };
    userAnswer: string;
    onSubmit: (answer: string) => void;
    currentQuestionIndex?: number;
    totalQuestions?: number;
    onPrevious?: () => void;
    onNext?: () => void;
    canGoNext?: boolean;
    questionType: string;
    typeColor?: string;
}
export function PreliminaryQuestion({ question, userAnswer, onSubmit, currentQuestionIndex = 0, totalQuestions = 0, onPrevious, onNext, canGoNext = false, questionType, typeColor = 'purple' }: PreliminaryQuestionProps) {
    const colorClasses = {
        purple: 'text-purple-600',
        blue: 'text-blue-600',
        green: 'text-green-600',
        orange: 'text-orange-600'
    };
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
    return (<div className="w-full max-w-3xl bg-white p-6 rounded-lg shadow-md">
      <div className={`mb-2 text-sm font-medium ${colorClasses[typeColor as keyof typeof colorClasses] || colorClasses.purple}`}>
        {questionType}
      </div>

      {totalQuestions > 0 && (<div className="mb-4 text-sm text-gray-500">
          {t('questionCounter', { current: currentQuestionIndex + 1, total: totalQuestions })}
        </div>)}

      <div className="text-lg font-semibold mb-4 text-gray-800">
        {formatQuestionText(question.question)}
      </div>

      <AnswerOptions options={question.options} selectedAnswer={userAnswer} onSelect={onSubmit} name={`question-${currentQuestionIndex}`} className="mb-6"/>

      <div className="flex justify-between items-center">
        {onPrevious && (<button onClick={onPrevious} disabled={currentQuestionIndex === 0} className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition-colors text-sm sm:text-base min-w-0 ${currentQuestionIndex === 0
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gray-500 text-white hover:bg-gray-600'}`}>
            <span className="truncate">{t('back')}</span>
          </button>)}

        <div className="text-sm text-gray-500">
          {userAnswer ? (<span>
              {t('answerSelected')}
              {canGoNext && onNext && (<span className="ml-2 text-blue-500">
                  • {t('pressEnterToContinue')}
                </span>)}
            </span>) : (t('selectAnswer'))}
        </div>

        {onNext && (<button onClick={onNext} disabled={!canGoNext} className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition-colors text-sm sm:text-base min-w-0 ${!canGoNext
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
            <span className="truncate">
              {currentQuestionIndex === totalQuestions - 1 ? t('finish') : t('forward')}
            </span>
          </button>)}
      </div>
    </div>);
}
export default PreliminaryQuestion;

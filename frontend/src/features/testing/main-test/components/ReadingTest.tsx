import { useState } from 'react';
import { testApi } from '@shared/api/api';
import { useQuestionNavigation } from '@shared/hooks/useQuestionNavigation';
import { withErrorHandling } from '@shared/utils/errorHandler';
import { t } from '@shared/utils/i18n';
import { TestProgress } from '@shared/components/feedback/TestProgress';
import { QuestionNavigation } from '@shared/components/navigation/QuestionNavigation';
import { SubmitButton } from '@shared/components/forms/SubmitButton';
import { AnswerOptions } from '@shared/components/forms/AnswerOptions';
interface ReadingTestProps {
    sessionId: string;
    passage: string;
    questions: Question[];
    onComplete: (allQuestionsAnswered: boolean) => void;
}
interface Question {
    id: number;
    question: string;
    options: Record<string, string>;
    question_number: number;
}
function ReadingTest({ sessionId, passage, questions, onComplete }: ReadingTestProps) {
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [showPassage, setShowPassage] = useState(true);
    const { currentIndex: currentQuestionIndex, goToNext, goToPrevious, goToQuestion } = useQuestionNavigation(questions.length);
    async function handleAnswerSelect(questionId: number, answer: string) {
        const newAnswers = { ...answers, [questionId]: answer };
        setAnswers(newAnswers);
        await withErrorHandling(() => testApi.submitReadingAnswer(sessionId, questionId, answer), 'submit reading answer');
    }
    function handleNextQuestion() {
        goToNext();
    }
    function handlePreviousQuestion() {
        goToPrevious();
    }
    function handleSubmit() {
        const allAnswered = questions.every(q => answers[q.id]);
        onComplete(allAnswered);
    }
    if (!questions || questions.length === 0) {
        return (<div className="text-center py-10">
        <p className="text-lg text-gray-600">{t('noQuestions')}</p>
      </div>);
    }
    const currentQuestion = questions[currentQuestionIndex];
    return (<div className="space-y-6">
      <TestProgress current={Object.keys(answers).length} total={questions.length}/>

      <div className="flex justify-end">
        <button onClick={() => setShowPassage(!showPassage)} className="bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors text-sm min-w-0">
          <span className="truncate">
            {showPassage ? t('hidePassage') : t('showPassage')}
          </span>
        </button>
      </div>

      <div className={`grid grid-cols-1 ${showPassage ? 'lg:grid-cols-2' : ''} gap-6`}>

        {showPassage && (<div className="bg-white rounded-lg shadow-sm p-6 h-fit">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('readingPassage')}</h3>
            <div className="prose prose-gray max-w-none max-h-[60vh] overflow-y-auto">
              <div className="text-gray-700 leading-relaxed whitespace-pre-line">
                {passage}
              </div>
            </div>
          </div>)}

        <div className="bg-white rounded-lg shadow-sm p-6">
          <QuestionNavigation currentIndex={currentQuestionIndex} totalQuestions={questions.length} onPrevious={handlePreviousQuestion} onNext={handleNextQuestion}/>

          <div className="mb-6">
            <p className="text-gray-900 text-lg mb-4">{currentQuestion.question}</p>
            <AnswerOptions options={currentQuestion.options} selectedAnswer={answers[currentQuestion.id] || ''} onSelect={(key: string) => handleAnswerSelect(currentQuestion.id, key)} name={`question-${currentQuestion.id}`}/>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">{t('goToQuestion')}</h4>
            <div className="flex flex-wrap gap-2">
              {questions.map((_, index) => (<button key={index} onClick={() => goToQuestion(index)} className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${index === currentQuestionIndex
                ? 'bg-blue-600 text-white'
                : answers[questions[index].id]
                    ? 'bg-green-100 text-green-800 border border-green-300'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                  {index + 1}
                </button>))}
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <SubmitButton onClick={handleSubmit} isLoading={false} className="w-full sm:w-auto text-sm sm:text-base px-4 py-2 min-w-0">
              <span className="truncate">{t('completeSection')}</span>
            </SubmitButton>
          </div>
        </div>
      </div>
    </div>);
}
export default ReadingTest;

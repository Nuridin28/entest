import React, { useState, useEffect } from 'react';
import { t } from '@shared/utils/i18n';
interface TestResultsProps {
    results: {
        score_percentage: number;
        correct_answers: number;
        total_questions: number;
        passed: boolean;
        category_stats: {
            grammar: {
                correct: number;
                total: number;
                percentage: number;
            };
            vocabulary: {
                correct: number;
                total: number;
                percentage: number;
            };
            reading: {
                correct: number;
                total: number;
                percentage: number;
            };
        };
        current_level: string;
        next_action: {
            action: string;
            next_level?: string;
            level?: string;
            options?: Array<{
                result: string;
                level: string;
            }>;
        };
    };
    onContinue: () => void;
    onFinish: () => void;
}
const TestResults: React.FC<TestResultsProps> = ({ results, onFinish }) => {
    const [countdown, setCountdown] = useState(6);
    useEffect(() => {
        if (results.next_action.action === 'continue_test' || results.next_action.action === 'ai_test') {
            const timer = setInterval(() => {
                setCountdown((prev) => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [results.next_action.action]);
    const renderNextActionButton = () => {
        if (results.next_action.action === 'continue_test') {
            return (<div className="flex flex-col items-center justify-center text-gray-800">
          <div className="flex items-center mb-3">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {t('automaticallyContinuingToNextLevel', { level: results.next_action.next_level as string })}
          </div>
          <div className="text-2xl font-bold text-blue-600">
            {countdown > 0 ? `${countdown}s` : t('loading')}
          </div>
        </div>);
        }
        else if (results.next_action.action === 'ai_test') {
            return (<div className="flex flex-col items-center justify-center text-gray-800">
          <div className="flex items-center mb-3">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-purple-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {t('automaticallyStartingAiTest', { level: results.next_action.level as string })}
          </div>
          <div className="text-2xl font-bold text-purple-600">
            {countdown > 0 ? `${countdown}s` : t('loading')}
          </div>
        </div>);
        }
        else if (results.next_action.action === 'set_level') {
            if (results.next_action.level === 'A1' || results.next_action.level === 'A2') {
                return (<div className="flex flex-col items-center justify-center text-gray-800">
            <div className="flex items-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-green-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {t('redirectingToResults')}
            </div>
          </div>);
            }
            else {
                return (<button onClick={onFinish} className="px-4 sm:px-6 py-2 sm:py-3 bg-green-600 text-white text-sm sm:text-lg font-medium rounded-lg hover:bg-green-700 transition-colors shadow-md min-w-0">
            <span className="truncate">{t('proceedToMainTest')}</span>
          </button>);
            }
        }
        else {
            return (<button onClick={onFinish} className="px-4 sm:px-6 py-2 bg-blue-600 text-white text-sm sm:text-base rounded-lg hover:bg-blue-700 transition-colors min-w-0">
          <span className="truncate">{t('continue')}</span>
        </button>);
        }
    };
    return (<div className="w-full max-w-3xl bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">{t('preliminaryTestResults')}</h2>

      <div className="mb-8">
        <div className="flex justify-between items-center mb-2">
          <span className="text-lg text-gray-800">{t('totalScore')}:</span>
          <span className="text-xl font-bold text-gray-800">{Math.round(results.score_percentage)}%</span>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-3">
          <div className={`h-3 rounded-full ${results.passed ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${results.score_percentage}%` }}></div>
        </div>

        <div className="mt-2 text-center">
          <span className={`font-semibold ${results.passed ? 'text-green-600' : 'text-red-600'}`}>
            {results.correct_answers} / {results.total_questions} {t('correctAnswers')}
          </span>
        </div>
      </div>

      <div className="bg-blue-100 border border-blue-300 rounded-lg p-6 mb-6">
        <h3 className="text-xl font-bold mb-3 text-gray-900">{t('testResult')}</h3>

        {results.passed ? (<p className="text-lg text-gray-900">{t('levelPassed', { level: results.current_level as string })}</p>) : (<p className="text-lg text-gray-900">{t('levelFailed', { level: results.current_level as string })}</p>)}

        {results.next_action.action === 'continue_test' && (<p className="mt-2 text-lg text-gray-900">{t('canProceedToNextLevel', { level: results.next_action.next_level as string })}</p>)}

        {results.next_action.action === 'ai_test' && (<div>
            <p className="mt-2 text-lg text-gray-900">{t('needAiTest', { level: results.next_action.level as string })}</p>
            <p className="mt-2 text-gray-800">{t('aiTestExplanation', { level: results.next_action.level as string })}</p>
          </div>)}

        {results.next_action.action === 'set_level' && (<div>
            <p className="mt-3 text-xl font-bold text-gray-900">{t('finalLevelDetermined', { level: results.next_action.level as string })}</p>
            {(results.next_action.level === 'A1' || results.next_action.level === 'A2') ? (<p className="mt-2 text-lg text-gray-900">{t('testCompletedWithElementaryLevel')}</p>) : (<p className="mt-2 text-lg text-gray-900">{t('readyForMainTest')}</p>)}
          </div>)}
      </div>

      {(results.next_action.action === 'continue_test' || results.next_action.action === 'ai_test') && (<div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-center text-yellow-800">
            {t('reviewResultsMessage')}
          </p>
        </div>)}

      <div className="flex justify-center mt-6">
        {renderNextActionButton()}
      </div>
    </div>);
};
export default TestResults;

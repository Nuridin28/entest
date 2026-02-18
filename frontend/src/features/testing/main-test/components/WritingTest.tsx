import { useState, useEffect, useRef, useCallback } from 'react';
import { testApi } from '@shared/api/api';
import { withErrorHandling } from '@shared/utils/errorHandler';
import { t } from '@shared/utils/i18n';
import { SubmitButton } from '@shared/components/forms/SubmitButton';
interface WritingTestProps {
    sessionId: string;
    level: string;
    prompts: WritingPrompt[];
    onComplete: (allQuestionsAnswered: boolean) => void;
}
interface WritingPrompt {
    id: number;
    title: string;
    prompt: string;
    instructions: string;
    word_count: number;
    time_limit: number;
    evaluation_criteria: string[];
    prompt_number: number;
}
function WritingTest({ sessionId, level, prompts, onComplete }: WritingTestProps) {
    const [answer, setAnswer] = useState<string>('');
    const [lastSavedAnswer, setLastSavedAnswer] = useState<string>('');
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    useEffect(() => {
    }, []);
    const saveDraft = useCallback(async (value: string) => {
        if (!prompts || prompts.length === 0 || value === lastSavedAnswer) {
            return;
        }
        setIsSaving(true);
        try {
            const promptId = prompts[0].id;
            await withErrorHandling(() => testApi.saveWritingDraft(sessionId, promptId, value), 'save writing draft');
            setLastSavedAnswer(value);
        }
        catch (error) {
            console.error('Failed to save writing draft:', error);
        }
        finally {
            setIsSaving(false);
        }
    }, [sessionId, prompts, lastSavedAnswer]);
    const debouncedSave = useCallback((value: string) => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
            saveDraft(value);
        }, 2000);
    }, [saveDraft]);
    function handleAnswerChange(value: string) {
        setAnswer(value);
        debouncedSave(value);
    }
    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);
    function getWordCount(text: string): number {
        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    }
    async function handleSubmit() {
        if (!prompts || prompts.length === 0) {
            onComplete(false);
            return;
        }
        const isAnswered = answer.trim().length > 0;
        if (!isAnswered) {
            onComplete(false);
            return;
        }
        setIsEvaluating(true);
        try {
            const promptId = prompts[0].id;
            await withErrorHandling(() => testApi.submitWritingAnswer(sessionId, promptId, answer, level), 'evaluate writing answer');
            onComplete(true);
        }
        catch (error) {
            console.error('Failed to evaluate writing answer:', error);
            onComplete(false);
        }
        finally {
            setIsEvaluating(false);
        }
    }
    if (!prompts || prompts.length === 0) {
        return <div className="text-center py-10">{t('noWritingTasks')}</div>;
    }
    const currentPrompt = prompts[0];
    if (!currentPrompt) {
        return <div className="text-center py-10">{t('promptNotFound')}</div>;
    }
    const wordCount = getWordCount(answer);
    return (<div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">{t('instructions')}</h3>
        <ul className="text-blue-800 text-sm space-y-1">
          <li>• {t('writingInstruction1')}</li>
          <li>• {t('writingInstruction2')}</li>
          <li>• {t('writingInstruction3')}</li>
          <li>• {t('writingInstruction4')}</li>
        </ul>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h4 className="text-xl font-bold text-gray-900">{currentPrompt.title}</h4>
            <p className="text-gray-700">{currentPrompt.prompt}</p>
            <p className="text-sm text-gray-600">{currentPrompt.instructions}</p>
            <div className="relative">
              <textarea ref={textareaRef} value={answer} onChange={(e) => handleAnswerChange(e.target.value)} rows={15} className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900 bg-white" placeholder={t('startWritingHere')}/>
              <div className="absolute bottom-2 right-2 flex items-center space-x-2 text-sm text-gray-500">
                <span>{wordCount} / {currentPrompt.word_count} {t('words')}</span>
                {isSaving && (<span className="text-blue-500 flex items-center">
                    <svg className="animate-spin -ml-1 mr-1 h-3 w-3 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {t('saving')}
                  </span>)}
                {!isSaving && answer === lastSavedAnswer && answer.length > 0 && (<span className="text-green-500">✓ {t('saved')}</span>)}
              </div>
            </div>
          </div>
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-gray-100 p-4 rounded-lg">
              <h5 className="font-semibold text-gray-800 mb-2">{t('evaluationCriteria')}:</h5>
              <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                {currentPrompt.evaluation_criteria?.map((criterion, index) => (<li key={index}>{criterion}</li>)) || <li>{t('noCriteriaAvailable')}</li>}
              </ul>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
              <h5 className="font-semibold text-yellow-900 mb-2">{t('importantNote')}</h5>
              <p className="text-sm text-yellow-800">{t('writingTimerNote')}</p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <SubmitButton onClick={handleSubmit} isLoading={isEvaluating} className="w-full lg:w-auto">
            {isEvaluating ? t('evaluating') : t('completeSection')}
          </SubmitButton>
        </div>
      </div>
    </div>);
}
export default WritingTest;

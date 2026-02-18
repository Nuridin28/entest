import { useState, useEffect } from 'react';
import { testApi } from '@shared/api/api';
import { addToast } from '@shared/utils/toast';
import { useAudioPlayer } from '@shared/hooks/useAudioPlayer';
import { useQuestionNavigation } from '@shared/hooks/useQuestionNavigation';
import { withErrorHandling } from '@shared/utils/errorHandler';
import { t } from '@shared/utils/i18n';
import { TestProgress } from '@shared/components/feedback/TestProgress';
import { QuestionNavigation } from '@shared/components/navigation/QuestionNavigation';
import { SubmitButton } from '@shared/components/forms/SubmitButton';
import { AnswerOptions } from '@shared/components/forms/AnswerOptions';
interface ListeningTestProps {
    sessionId: string;
    scenarios: Scenario[];
    onComplete: (allQuestionsAnswered: boolean) => void;
}
interface Scenario {
    id: number;
    audio_path: string;
    question: string;
    options: Record<string, string>;
    scenario_number: number;
}
function ListeningTest({ sessionId, scenarios, onComplete }: ListeningTestProps) {
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [isPlaying, setIsPlaying] = useState<Record<number, boolean>>({});
    const [isLoading, setIsLoading] = useState<Record<number, boolean>>({});
    const [playCount, setPlayCount] = useState<Record<number, number>>({});
    const { currentIndex: currentScenarioIndex, goToNext, goToPrevious, goToQuestion } = useQuestionNavigation(scenarios.length);
    const { playAudio, stopAllAudio } = useAudioPlayer({
        onAudioEnd: () => {
            setIsPlaying(prev => {
                const newState = { ...prev };
                Object.keys(newState).forEach(key => {
                    newState[parseInt(key)] = false;
                });
                return newState;
            });
        },
        onAudioError: (error) => {
            console.error('Audio playback error:', error);
            addToast({ type: 'error', message: t('audioPlayError') });
            setIsLoading({});
            setIsPlaying({});
        }
    });
    async function handleAnswerSelect(scenarioId: number, answer: string) {
        const newAnswers = { ...answers, [scenarioId]: answer };
        setAnswers(newAnswers);
        await withErrorHandling(() => testApi.submitListeningAnswer(sessionId, scenarioId, answer), 'submit listening answer');
    }
    function handleNextScenario() {
        stopAllAudio();
        goToNext();
    }
    function handlePreviousScenario() {
        stopAllAudio();
        goToPrevious();
    }
    async function handlePlayAudio(scenarioId: number) {
        if (playCount[scenarioId] >= 3) {
            addToast({ type: 'info', message: t('maxAudioPlays') });
            return;
        }
        stopAllAudio();
        setIsLoading(prev => ({ ...prev, [scenarioId]: true }));
        setIsPlaying(prev => ({ ...prev, [scenarioId]: false }));
        await withErrorHandling(async () => {
            const scenario = scenarios.find(s => s.id === scenarioId);
            if (!scenario)
                throw new Error("Scenario not found");
            const filename = scenario.audio_path?.split('/').pop();
            if (!filename)
                throw new Error("Audio filename not found");
            const audioBlob = await testApi.getAudioFile(sessionId, filename);
            setIsLoading(prev => ({ ...prev, [scenarioId]: false }));
            setIsPlaying(prev => ({ ...prev, [scenarioId]: true }));
            await playAudio(`scenario-${scenarioId}`, audioBlob);
            setPlayCount(prev => ({ ...prev, [scenarioId]: (prev[scenarioId] || 0) + 1 }));
        }, 'play listening audio', () => {
            setIsLoading(prev => ({ ...prev, [scenarioId]: false }));
            setIsPlaying(prev => ({ ...prev, [scenarioId]: false }));
        });
    }
    function handleStopAudio(scenarioId: number) {
        stopAllAudio();
        setIsPlaying(prev => ({ ...prev, [scenarioId]: false }));
        setIsLoading(prev => ({ ...prev, [scenarioId]: false }));
    }
    function handleSubmit() {
        stopAllAudio();
        const allAnswered = scenarios.every(s => answers[s.id]);
        onComplete(allAnswered);
    }
    useEffect(() => {
        stopAllAudio();
    }, [currentScenarioIndex, stopAllAudio]);
    if (!scenarios || scenarios.length === 0) {
        return (<div className="text-center py-10">
        <p className="text-lg text-gray-600">{t('noScenarios')}</p>
      </div>);
    }
    const currentScenario = scenarios[currentScenarioIndex];
    if (!currentScenario) {
        return (<div className="text-center py-10">
        <p className="text-lg text-gray-600">{t('scenarioNotFound')}</p>
      </div>);
    }
    return (<div className="space-y-6">
      <TestProgress current={Object.keys(answers).length} total={scenarios.length}/>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <QuestionNavigation currentIndex={currentScenarioIndex} totalQuestions={scenarios.length} onPrevious={handlePreviousScenario} onNext={handleNextScenario} disabled={Object.values(isPlaying).some(val => val)} disabledReason={t('waitForAudioEnd')}/>

            <div className="mb-6">
              <p className="text-gray-900 text-lg mb-4">{currentScenario.question}</p>
              {currentScenario.options && Object.entries(currentScenario.options).length > 0 ? (<AnswerOptions options={currentScenario.options} selectedAnswer={answers[currentScenario.id] || ''} onSelect={(key: string) => handleAnswerSelect(currentScenario.id, key)} name={`scenario-${currentScenario.id}`}/>) : (<p className="text-gray-500">{t('noOptionsAvailable')}</p>)}
            </div>
            
            <div className="border-t pt-4 mt-6">
              <h4 className="text-sm font-medium text-gray-700 mb-3">{t('goToScenario')}</h4>
              <div className="flex flex-wrap gap-2">
                {scenarios.map((_, index) => (<button key={index} onClick={() => goToQuestion(index)} className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${index === currentScenarioIndex
                ? 'bg-blue-600 text-white'
                : answers[scenarios[index].id]
                    ? 'bg-green-100 text-green-800 border border-green-300'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                    {index + 1}
                  </button>))}
              </div>
            </div>

          </div>
        </div>
        
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-lg shadow-sm p-4">
            <h4 className="text-md font-semibold text-gray-800 mb-3">{t('audioControl')}</h4>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <button onClick={() => handlePlayAudio(currentScenario.id)} disabled={isLoading[currentScenario.id] || isPlaying[currentScenario.id] || playCount[currentScenario.id] >= 3} className="flex-1 px-2 sm:px-3 py-2 bg-green-500 text-white rounded-lg shadow-sm hover:bg-green-600 disabled:bg-gray-400 text-center text-xs sm:text-sm min-w-0 max-w-full overflow-hidden">
                <span className="block truncate">
                  {isLoading[currentScenario.id]
            ? `${t('loading')}...`
            : isPlaying[currentScenario.id]
                ? t('playing')
                : t('play')}
                </span>
              </button>
              <button onClick={() => handleStopAudio(currentScenario.id)} disabled={!isPlaying[currentScenario.id] && !isLoading[currentScenario.id]} className="flex-1 px-2 sm:px-3 py-2 bg-red-500 text-white rounded-lg shadow-sm hover:bg-red-600 disabled:bg-gray-400 text-xs sm:text-sm min-w-0 max-w-full overflow-hidden">
                <span className="block truncate">{t('stop')}</span>
              </button>
            </div>
            {isLoading[currentScenario.id] && (<button onClick={() => {
                setIsLoading(prev => ({ ...prev, [currentScenario.id]: false }));
                setIsPlaying(prev => ({ ...prev, [currentScenario.id]: false }));
                stopAllAudio();
            }} className="mt-2 px-3 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600">
                Сбросить состояние
              </button>)}
            <p className="text-sm text-gray-600 mt-3">
              {t('playsLeft', { count: 3 - (playCount[currentScenario.id] || 0) })}
            </p>
          </div>
          
          <div className="mt-6">
            <SubmitButton onClick={handleSubmit} isLoading={false} className="w-full text-sm sm:text-base px-3 py-3 min-w-0 max-w-full overflow-hidden">
              <span className="block truncate">{t('completeSection')}</span>
            </SubmitButton>
          </div>
        </div>
      </div>
    </div>);
}
export default ListeningTest;

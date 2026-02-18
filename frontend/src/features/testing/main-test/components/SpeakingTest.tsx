import { useState, useEffect, useRef } from 'react';
import { testApi } from '@shared/api/api';
import { addToast } from '@shared/utils/toast';
import { useStableTimer } from '@shared/hooks/useStableTimer';
import { useAudioPlayer } from '@shared/hooks/useAudioPlayer';
import { useMediaRecorder } from '@shared/hooks/useMediaRecorder';
import { useQuestionNavigation } from '@shared/hooks/useQuestionNavigation';
import { withErrorHandling } from '@shared/utils/errorHandler';
import { t } from '@shared/utils/i18n';
import { formatTime } from '@shared/utils/timeFormatter';
import { TestProgress } from '@shared/components/feedback/TestProgress';
import { QuestionNavigation } from '@shared/components/navigation/QuestionNavigation';
import { SubmitButton } from '@shared/components/forms/SubmitButton';
interface SpeakingTestProps {
    sessionId: string;
    questions: SpeakingQuestion[];
    onComplete: (allQuestionsAnswered: boolean) => void;
}
interface SpeakingQuestion {
    id: number;
    type: string;
    question: string;
    follow_up?: string;
    audio_path: string;
    preparation_time: number;
    speaking_time: number;
    evaluation_criteria: string[];
    question_number: number;
}
function SpeakingTest({ sessionId, questions, onComplete }: SpeakingTestProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [recordings, setRecordings] = useState<Record<number, Blob>>({});
    const [hasPlayedAudio, setHasPlayedAudio] = useState<Record<number, boolean>>({});
    const [replayCount, setReplayCount] = useState<Record<number, number>>({});
    const [rerecordCount, setRerecordCount] = useState<Record<number, number>>({});
    const [phase, setPhase] = useState<'waiting' | 'listening' | 'preparing' | 'recording' | 'completed'>('waiting');
    const [isLoadingAudio, setIsLoadingAudio] = useState(false);
    const playbackUrlRef = useRef<string | null>(null);
    const { currentIndex: currentQuestionIndex, goToNext, goToPrevious } = useQuestionNavigation(questions.length);
    const preparationTimer = useStableTimer(0, {
        onEnd: () => {
            const currentQuestion = questions[currentQuestionIndex];
            if (currentQuestion) {
                handleStartRecording(currentQuestion);
            }
        },
    });
    const speakingTimer = useStableTimer(0, {
        onEnd: () => {
            handleStopRecording();
        },
    });
    const { playAudio, stopAllAudio } = useAudioPlayer({
        onAudioEnd: () => {
            const currentQuestion = questions[currentQuestionIndex];
            if (currentQuestion) {
                setHasPlayedAudio(prev => ({ ...prev, [currentQuestion.id]: true }));
                startPreparation(currentQuestion.id);
            }
        },
        onAudioReady: () => {
            setIsLoadingAudio(false);
        }
    });
    const { startRecording, stopRecording, isRecording } = useMediaRecorder({
        onRecordingComplete: (blob) => {
            const currentQuestion = questions[currentQuestionIndex];
            if (currentQuestion) {
                setRecordings(prev => ({ ...prev, [currentQuestion.id]: blob }));
                setPhase('completed');
            }
        }
    });
    useEffect(() => {
        return () => {
            if (playbackUrlRef.current) {
                URL.revokeObjectURL(playbackUrlRef.current);
            }
        };
    }, []);
    useEffect(() => {
        const recording = recordings[questions[currentQuestionIndex]?.id];
        if (recording) {
            if (playbackUrlRef.current) {
                URL.revokeObjectURL(playbackUrlRef.current);
            }
            playbackUrlRef.current = URL.createObjectURL(recording);
            setPhase('completed');
        }
    }, [recordings, currentQuestionIndex, questions]);
    useEffect(() => {
        const currentQuestion = questions[currentQuestionIndex];
        if (currentQuestion) {
            if (recordings[currentQuestion.id]) {
                setPhase('completed');
            }
            else {
                setPhase('waiting');
            }
            resetTimers();
        }
    }, [currentQuestionIndex, questions]);
    async function handlePlayPrompt(questionId: number, isRepeat: boolean = false) {
        resetTimers();
        setIsLoadingAudio(true);
        setPhase('listening');
        await withErrorHandling(async () => {
            const question = questions.find(q => q.id === questionId);
            if (!question)
                throw new Error("Question not found");
            const filename = question.audio_path.split('/').pop();
            if (!filename)
                throw new Error("Audio filename not found");
            const audioBlob = await testApi.getAudioFile(sessionId, filename);
            await playAudio(`prompt-${questionId}`, audioBlob);
            if (isRepeat) {
                setReplayCount(prev => ({ ...prev, [questionId]: (prev[questionId] || 0) + 1 }));
            }
        }, 'play audio prompt', () => {
            setPhase('waiting');
            setIsLoadingAudio(false);
        });
    }
    function startPreparation(questionId: number) {
        const question = questions.find(q => q.id === questionId);
        if (!question)
            return;
        setPhase('preparing');
        preparationTimer.reset(question.preparation_time);
        preparationTimer.start();
    }
    async function handleStartRecording(question: SpeakingQuestion) {
        setPhase('recording');
        await withErrorHandling(async () => {
            await startRecording();
            speakingTimer.reset(question.speaking_time);
            speakingTimer.start();
        }, 'start recording', () => {
            setPhase('waiting');
        });
    }
    function handleStopRecording() {
        if (isRecording) {
            stopRecording();
            speakingTimer.stop();
        }
    }
    function handleNextQuestion() {
        if (phase === 'listening' || phase === 'preparing' || phase === 'recording' || isLoadingAudio) {
            addToast({ type: 'warning', message: t('waitForPhaseEnd') });
            return;
        }
        resetTimers();
        goToNext();
    }
    function handlePreviousQuestion() {
        if (phase === 'listening' || phase === 'preparing' || phase === 'recording' || isLoadingAudio) {
            addToast({ type: 'warning', message: t('waitForPhaseEnd') });
            return;
        }
        resetTimers();
        goToPrevious();
    }
    function resetTimers() {
        preparationTimer.stop();
        speakingTimer.stop();
        stopAllAudio();
        if (isRecording) {
            stopRecording();
        }
    }
    function handleResetQuestion(questionId: number) {
        resetTimers();
        if (playbackUrlRef.current) {
            URL.revokeObjectURL(playbackUrlRef.current);
            playbackUrlRef.current = null;
        }
        setRecordings(prev => {
            const newRecordings = { ...prev };
            delete newRecordings[questionId];
            return newRecordings;
        });
        setRerecordCount(prev => ({ ...prev, [questionId]: (prev[questionId] || 0) + 1 }));
        const question = questions.find(q => q.id === questionId);
        if (question) {
            handleStartRecording(question);
        }
        else {
            setPhase('waiting');
        }
    }
    async function handleSubmit() {
        setIsSubmitting(true);
        await withErrorHandling(async () => {
            for (const question of questions) {
                const recording = recordings[question.id];
                if (recording) {
                    const formData = new FormData();
                    formData.append('audio_file', recording, `speaking_answer_${question.id}.webm`);
                    await testApi.submitSpeakingAnswer(sessionId, question.id, formData);
                }
            }
            const allAnswered = questions.every(q => recordings[q.id]);
            onComplete(allAnswered);
        }, 'submit speaking answers');
        setIsSubmitting(false);
    }
    if (!questions || questions.length === 0) {
        return <div className="text-center py-10">{t('noQuestions')}</div>;
    }
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) {
        return <div className="text-center py-10">{t('loading')}</div>;
    }
    const canReplay = (replayCount[currentQuestion.id] || 0) < 1 && hasPlayedAudio[currentQuestion.id];
    const canRerecord = (rerecordCount[currentQuestion.id] || 0) < 1;
    return (<div className="space-y-4 sm:space-y-6 px-2 sm:px-0">
      <TestProgress current={Object.keys(recordings).length} total={questions.length}/>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
          <QuestionNavigation currentIndex={currentQuestionIndex} totalQuestions={questions.length} onPrevious={handlePreviousQuestion} onNext={handleNextQuestion} disabled={phase === 'listening' || phase === 'preparing' || phase === 'recording' || isLoadingAudio} disabledReason={t('waitForPhaseEnd')}/>

          <div className="space-y-4">
            
            <div className="text-center p-6 bg-gray-50 rounded-lg">
              <p className="text-gray-600 mb-4">{t('listenToQuestion')}</p>

              {phase === 'waiting' && (<button onClick={() => handlePlayPrompt(currentQuestion.id, false)} disabled={isLoadingAudio} className="bg-blue-500 text-white px-4 py-2 sm:px-6 sm:py-3 rounded-lg text-sm sm:text-base font-medium hover:bg-blue-600 disabled:bg-gray-400 w-full max-w-xs mx-auto block">
                  {isLoadingAudio ? t('loading') : t('listen')}
                </button>)}

              {phase === 'listening' && (<div className="text-blue-600">
                  <div className="animate-pulse text-lg">{t('listeningToQuestion')}</div>
                </div>)}

              {phase === 'preparing' && (<div className="text-orange-600">
                  <div className="text-2xl font-bold mb-2">{t('preparing', { time: formatTime(preparationTimer.time) })}</div>
                  <p className="text-sm">{t('prepareForAnswer')}</p>
                  {canReplay && (<button onClick={() => handlePlayPrompt(currentQuestion.id, true)} disabled={isLoadingAudio} className="mt-2 text-xs sm:text-sm text-blue-500 hover:text-blue-700 underline disabled:text-gray-400 disabled:cursor-not-allowed px-2 py-1 rounded">
                      {isLoadingAudio ? t('loading') : t('repeatQuestion', { count: 1 - (replayCount[currentQuestion.id] || 0) })}
                    </button>)}
                </div>)}

              {phase === 'recording' && (<div className="text-red-600">
                  <div className="text-2xl font-bold mb-2">{t('recording', { time: formatTime(speakingTimer.time) })}</div>
                  <div className="animate-pulse">{t('speakNow')}</div>
                  <button onClick={handleStopRecording} className="mt-3 bg-red-500 text-white px-4 py-2 sm:px-6 sm:py-3 rounded-lg hover:bg-red-600 text-sm sm:text-base font-medium w-full max-w-xs mx-auto block">
                    {t('stopRecording')}
                  </button>
                </div>)}

              {phase === 'completed' && recordings[currentQuestion.id] && (<div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-green-600 font-semibold mb-3 text-center">{t('answerRecorded')}</div>
                  <div className="mb-4">
                    <audio src={playbackUrlRef.current ?? undefined} controls className="w-full max-w-md mx-auto block"/>
                  </div>
                  <button onClick={() => handleResetQuestion(currentQuestion.id)} disabled={!canRerecord} className="bg-orange-500 text-white px-4 py-2 sm:px-6 sm:py-3 rounded-lg hover:bg-orange-600 text-sm sm:text-base font-medium disabled:bg-gray-400 disabled:cursor-not-allowed w-full max-w-xs mx-auto block">
                    {canRerecord ? t('rerecordAnswer') : 'Re-record used'}
                  </button>
                </div>)}
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 space-y-4 text-sm sm:text-base">
          <h4 className="font-semibold text-gray-800">{t('instructions')}</h4>
          <ul className="list-disc list-inside text-sm space-y-1 text-gray-700">
            <li>{t('instructionListen')}</li>
            <li>{t('instructionPrepare', { time: currentQuestion.preparation_time })}</li>
            <li>{t('instructionRecord')}</li>
            <li>{t('instructionAnswerTime', { time: currentQuestion.speaking_time })}</li>
            <li>{t('instructionRepeat')}</li>
            <li>{t('instructionRerecord')}</li>
          </ul>

          <h4 className="font-semibold text-gray-800">{t('evaluationCriteria')}</h4>
          <ul className="list-disc list-inside text-sm space-y-1 text-gray-700">
            {currentQuestion.evaluation_criteria?.map((c, i) => <li key={i}>{c}</li>) || []}
          </ul>

          <div className="mt-4 p-3 bg-blue-50 rounded">
            <h5 className="font-medium text-blue-800 mb-2">{t('taskType', { type: currentQuestion.type })}</h5>
            <div className="text-sm text-blue-700">
              <p>{t('preparationTime', { time: currentQuestion.preparation_time })}</p>
              <p>{t('answerTime', { time: currentQuestion.speaking_time })}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-center px-4">
        <SubmitButton onClick={handleSubmit} isLoading={isSubmitting} className="w-full sm:w-auto max-w-md text-sm sm:text-base px-6 py-3 font-medium">
          {t('completeSection')}
        </SubmitButton>
      </div>
    </div>);
}
export default SpeakingTest;

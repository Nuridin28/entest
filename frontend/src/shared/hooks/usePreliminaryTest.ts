import { useState, useCallback, useRef } from 'react';
import { preliminaryTestApi } from '@shared/api/api';
import { addToast } from '@shared/utils/toast';
import { t } from '@shared/utils/i18n';
export type TestLevel = 'pre_intermediate' | 'intermediate' | 'upper_intermediate' | 'advanced';
export type TestStatus = 'starting' | 'loading' | 'in_progress' | 'completed' | 'error';
export function usePreliminaryTest() {
    const [preliminarySessionId, setPreliminarySessionId] = useState<number | null>(null);
    const [currentLevel, setCurrentLevel] = useState<TestLevel>('pre_intermediate');
    const [preliminaryTestStatus, setPreliminaryTestStatus] = useState<TestStatus>('starting');
    const [preliminaryTestData, setPreliminaryTestData] = useState<any>(null);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [allQuestions, setAllQuestions] = useState<any[]>([]);
    const [preliminaryTestResult, setPreliminaryTestResult] = useState<any>(null);
    const preliminaryTestGeneratedRef = useRef(false);
    const generateLevelTest = useCallback(async (sessionId: number, level: TestLevel) => {
        try {
            preliminaryTestGeneratedRef.current = true;
            setPreliminaryTestStatus('loading');
            setCurrentLevel(level);
            await preliminaryTestApi.generateLevelTest(sessionId, level);
            const questions = await preliminaryTestApi.getQuestions(sessionId);
            const allQuestionsArray = [
                ...questions.grammar.map((q: any) => ({ ...q, category: 'grammar' })),
                ...questions.vocabulary.map((q: any) => ({ ...q, category: 'vocabulary' })),
                ...questions.reading.map((q: any) => ({ ...q, category: 'reading' }))
            ].sort((a, b) => a.order_number - b.order_number);
            setPreliminaryTestData(questions);
            setAllQuestions(allQuestionsArray);
            setCurrentQuestionIndex(0);
            setAnswers({});
            setPreliminaryTestStatus('in_progress');
        }
        catch (err: any) {
            console.error(`Failed to generate ${level} test:`, err);
            addToast({ type: 'error', message: t('testGenerationError') });
            setPreliminaryTestStatus('error');
        }
    }, []);
    const handleAnswerSubmit = useCallback(async (answer: string) => {
        if (!preliminarySessionId || allQuestions.length === 0)
            return;
        const currentQuestion = allQuestions[currentQuestionIndex];
        if (!currentQuestion)
            return;
        try {
            setAnswers(prev => ({ ...prev, [currentQuestion.id]: answer }));
            const result = await preliminaryTestApi.submitAnswer(preliminarySessionId, currentQuestion.id, answer);
            if (result.warning) {
                console.warn('Submit answer warning:', result.warning);
            }
            if (result.error && !result.error.includes('Question not found')) {
                addToast({ type: 'warning', message: t('answerMayNotBeSaved') });
            }
        }
        catch (err: any) {
            console.error('Failed to submit answer:', err);
            if (!err.message?.includes('Question not found')) {
                addToast({ type: 'error', message: t('answerSubmissionError') });
            }
        }
    }, [preliminarySessionId, allQuestions, currentQuestionIndex]);
    const resetPreliminaryTest = useCallback(() => {
        setPreliminarySessionId(null);
        setCurrentLevel('pre_intermediate');
        setPreliminaryTestStatus('starting');
        setPreliminaryTestData(null);
        setCurrentQuestionIndex(0);
        setAnswers({});
        setAllQuestions([]);
        setPreliminaryTestResult(null);
        preliminaryTestGeneratedRef.current = false;
        console.log('Preliminary test state reset');
    }, []);
    return {
        preliminarySessionId,
        setPreliminarySessionId,
        currentLevel,
        preliminaryTestStatus,
        setPreliminaryTestStatus,
        preliminaryTestData,
        currentQuestionIndex,
        setCurrentQuestionIndex,
        answers,
        allQuestions,
        preliminaryTestResult,
        setPreliminaryTestResult,
        preliminaryTestGeneratedRef,
        generateLevelTest,
        handleAnswerSubmit,
        resetPreliminaryTest,
    };
}

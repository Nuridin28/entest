import { useState, useCallback } from 'react';
import { preliminaryTestApi } from '../api';
import type { PreliminaryTest, PreliminaryResult } from '../types';
export function usePreliminaryTest() {
    const [test, setTest] = useState<PreliminaryTest | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const startTest = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const session = await preliminaryTestApi.startPreliminaryTest();
            const newTest = {
                id: session.session_id.toString(),
                user_id: 'user-1',
                questions: [],
                started_at: new Date().toISOString(),
                max_score: 100
            };
            setTest(newTest);
            return newTest;
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start test');
            throw err;
        }
        finally {
            setIsLoading(false);
        }
    }, []);
    const submitAnswer = useCallback(async (questionId: string, answer: string | number) => {
        if (!test)
            return;
        try {
            await preliminaryTestApi.submitAnswer(parseInt(test.id), parseInt(questionId), String(answer));
            setTest(prev => {
                if (!prev)
                    return prev;
                return {
                    ...prev,
                    questions: prev.questions.map(q => q.id === questionId ? { ...q, user_answer: answer } : q)
                };
            });
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to submit answer');
            throw err;
        }
    }, [test]);
    const completeTest = useCallback(async () => {
        if (!test)
            return;
        try {
            setIsLoading(true);
            const result = await preliminaryTestApi.completeTest(parseInt(test.id));
            return result;
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to complete test');
            throw err;
        }
        finally {
            setIsLoading(false);
        }
    }, [test]);
    return {
        test,
        isLoading,
        error,
        startTest,
        submitAnswer,
        completeTest
    };
}
export function usePreliminaryResults() {
    const [results, setResults] = useState<PreliminaryResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const fetchResults = useCallback(async () => {
        try {
            setIsLoading(true);
            const data: PreliminaryResult[] = [];
            setResults(data);
        }
        catch (error) {
            console.error('Failed to fetch preliminary results:', error);
        }
        finally {
            setIsLoading(false);
        }
    }, []);
    return {
        results,
        isLoading,
        fetchResults
    };
}

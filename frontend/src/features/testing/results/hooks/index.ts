import { useState, useCallback } from 'react';
import { resultsApi } from '../api';
import type { TestResult, ResultSummary, DetailedResult } from '../types';
export function useTestResults() {
    const [results, setResults] = useState<TestResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fetchResults = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const data = await resultsApi.getUserTestResults();
            setResults(data);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch results');
        }
        finally {
            setIsLoading(false);
        }
    }, []);
    const getResultById = useCallback(async (resultId: string): Promise<DetailedResult> => {
        try {
            setIsLoading(true);
            setError(null);
            const result = await resultsApi.getTestResult(parseInt(resultId));
            const detailedResult = {
                ...result,
                questions: [],
                time_spent: 0,
                violations: []
            };
            return detailedResult;
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch result details');
            throw err;
        }
        finally {
            setIsLoading(false);
        }
    }, []);
    return {
        results,
        isLoading,
        error,
        fetchResults,
        getResultById
    };
}
export function useResultsHistory() {
    const [history, setHistory] = useState<ResultSummary[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fetchHistory = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const data: ResultSummary[] = [];
            setHistory(data);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch results history');
        }
        finally {
            setIsLoading(false);
        }
    }, []);
    return {
        history,
        isLoading,
        error,
        fetchHistory
    };
}

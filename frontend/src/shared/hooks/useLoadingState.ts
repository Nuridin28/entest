import { useState, useCallback } from 'react';
export function useLoadingState(initialState = false) {
    const [isLoading, setIsLoading] = useState(initialState);
    const [error, setError] = useState<string | null>(null);
    const withLoading = useCallback(async <T>(operation: () => Promise<T>, onError?: (error: any) => void): Promise<T | null> => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await operation();
            return result;
        }
        catch (err: any) {
            const errorMessage = err.message || 'An error occurred';
            setError(errorMessage);
            onError?.(err);
            return null;
        }
        finally {
            setIsLoading(false);
        }
    }, []);
    const reset = useCallback(() => {
        setIsLoading(false);
        setError(null);
    }, []);
    return {
        isLoading,
        error,
        withLoading,
        reset,
        setIsLoading,
        setError
    };
}

import { useState, useCallback, useRef } from 'react';
export const TIME_LIMITS = {
    LOADING_DELAY: 100,
} as const;
export function useLoadingManager() {
    const [isLoading, setIsLoading] = useState(false);
    const loadingTimeoutRef = useRef<number | null>(null);
    const setLoadingWithDelay = useCallback((loading: boolean, delay = TIME_LIMITS.LOADING_DELAY) => {
        if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
            loadingTimeoutRef.current = null;
        }
        if (loading) {
            loadingTimeoutRef.current = window.setTimeout(() => {
                setIsLoading(true);
                loadingTimeoutRef.current = null;
            }, delay);
        }
        else {
            setIsLoading(false);
        }
    }, []);
    return { isLoading, setLoadingWithDelay };
}

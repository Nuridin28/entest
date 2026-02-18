import { useState, useCallback } from 'react';
export function useQuestionNavigation(totalQuestions: number, initialIndex = 0) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const goToNext = useCallback(() => {
        setCurrentIndex(prev => Math.min(prev + 1, totalQuestions - 1));
    }, [totalQuestions]);
    const goToPrevious = useCallback(() => {
        setCurrentIndex(prev => Math.max(prev - 1, 0));
    }, []);
    const goToQuestion = useCallback((index: number) => {
        if (index >= 0 && index < totalQuestions) {
            setCurrentIndex(index);
        }
    }, [totalQuestions]);
    const canGoNext = currentIndex < totalQuestions - 1;
    const canGoPrevious = currentIndex > 0;
    return {
        currentIndex,
        goToNext,
        goToPrevious,
        goToQuestion,
        canGoNext,
        canGoPrevious,
        isFirst: currentIndex === 0,
        isLast: currentIndex === totalQuestions - 1
    };
}

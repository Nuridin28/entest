import { useState, useCallback } from 'react';
import { completeTestApi } from '../api';
import type { CompleteTest, TestSection } from '../types';
export function useCompleteTest() {
    const [test, setTest] = useState<CompleteTest | null>(null);
    const [currentSection, setCurrentSection] = useState<TestSection | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const startTest = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const newTest = await completeTestApi.startTest();
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
    const startSection = useCallback(async (sectionName: string) => {
        if (!test)
            return;
        try {
            setIsLoading(true);
            const section = {
                id: 'section-' + Date.now(),
                name: sectionName as any,
                questions: [],
                time_limit: 3600,
                max_score: 100
            };
            setCurrentSection(section);
            return section;
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start section');
            throw err;
        }
        finally {
            setIsLoading(false);
        }
    }, [test]);
    const submitAnswer = useCallback(async (questionId: string, answer: string | number) => {
        if (!test || !currentSection)
            return;
        try {
            setCurrentSection(prev => {
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
    }, [test, currentSection]);
    const completeSection = useCallback(async () => {
        if (!test || !currentSection)
            return;
        try {
            setIsLoading(true);
            const result = {
                section_name: currentSection.id,
                score: 0,
                max_score: 100,
                percentage: 0,
                time_spent: 0,
                questions_answered: 0,
                total_questions: 0
            };
            setCurrentSection(null);
            return result;
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to complete section');
            throw err;
        }
        finally {
            setIsLoading(false);
        }
    }, [test, currentSection]);
    const completeTest = useCallback(async () => {
        if (!test)
            return;
        try {
            setIsLoading(true);
            const result = await completeTestApi.completeTest(test.id);
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
        currentSection,
        isLoading,
        error,
        startTest,
        startSection,
        submitAnswer,
        completeSection,
        completeTest
    };
}
export function useTestSection(sectionName: string) {
    const [section, setSection] = useState<TestSection | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const loadSection = useCallback(async (testId: string) => {
        try {
            setIsLoading(true);
            setError(null);
            const sectionData = await completeTestApi.getSession(testId);
            setSection(sectionData);
            return sectionData;
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load section');
            throw err;
        }
        finally {
            setIsLoading(false);
        }
    }, [sectionName]);
    return {
        section,
        isLoading,
        error,
        loadSection
    };
}

import { useState, useRef } from 'react';
export type TestSection = 'reading' | 'listening' | 'writing' | 'speaking' | 'completed';
export type TestStatus = 'starting' | 'loading' | 'in_progress' | 'completed' | 'error';
export function useMainTest(initialSessionId?: string) {
    const [mainSessionId, setMainSessionId] = useState<string | null>(initialSessionId || null);
    const [currentSection, setCurrentSection] = useState<TestSection>('reading');
    const [mainTestData, setMainTestData] = useState<any>(null);
    const [mainTestResults, setMainTestResults] = useState<any>(null);
    const [mainTestStatus, setMainTestStatus] = useState<TestStatus>('starting');
    const [isGeneratingTest, setIsGeneratingTest] = useState(false);
    const mainTestGeneratedRef = useRef(false);
    return {
        mainSessionId,
        setMainSessionId,
        currentSection,
        setCurrentSection,
        mainTestData,
        setMainTestData,
        mainTestResults,
        setMainTestResults,
        mainTestStatus,
        setMainTestStatus,
        isGeneratingTest,
        setIsGeneratingTest,
        mainTestGeneratedRef,
    };
}

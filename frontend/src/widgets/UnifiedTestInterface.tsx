import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ConfirmModal } from '@shared/components';
import { ProctoringSidebar } from '@features/proctoring/ProctoringSidebar';
import { PreliminaryTestContainer } from '@features/testing/containers/PreliminaryTestContainer';
import { MainTestContainer } from '@features/testing/containers/MainTestContainer';
import { TestAnnulledStatus, LoadingIndicator } from '@shared/components';
import { useStableTimer } from '@shared/hooks/useStableTimer';
import { useLoadingManager } from '@shared/hooks/useLoadingManager';
import { useTestAnnulment, type TestMode } from '@shared/hooks/useTestAnnulment';
import { usePreliminaryTest } from '@shared/hooks/usePreliminaryTest';
import { useMainTest, type TestSection } from '@shared/hooks/useMainTest';
import { useModal } from '@shared/hooks/useModal';
import { TIME_LIMITS, UI_CONSTANTS } from '@shared/utils/testConstants';
import { preliminaryTestService } from '@shared/services/preliminaryTestService';
import { MainTestService } from '@shared/services/mainTestService';
import { addToast } from '@shared/utils/toast';
import { t } from '@shared/utils/i18n';
export interface UnifiedTestInterfaceProps {
    onTestComplete: () => void;
    onLogout: () => void;
    cameraStream: MediaStream | null;
    screenStream: MediaStream | null;
    proctoringState: any;
    screenState: any;
    audioState: any;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    onVideoMetadataLoaded: () => void;
    logCheatingEvent: (type: string, metadata?: object) => void;
    isTestActive: boolean;
    setIsTestActive: React.Dispatch<React.SetStateAction<boolean>>;
    stopProctoringSession: () => void;
    pauseProctoringSession: () => void;
    pauseProctoringSessionKeepRecording: () => void;
    resumeProctoringMonitoring: () => void;
    resetForNewTest: () => void;
    requestFullscreenProgrammatically: () => Promise<void>;
    saveCurrentRecording: () => Promise<void>;
    saveFinalRecording: () => Promise<void>;
    setTransitionState: (isTransitioning: boolean) => void;
    initialSessionId?: string;
}
function UnifiedTestInterface(props: UnifiedTestInterfaceProps) {
    const { onTestComplete, onLogout, cameraStream, proctoringState, screenState, audioState, videoRef, canvasRef, onVideoMetadataLoaded, logCheatingEvent, isTestActive, setIsTestActive, pauseProctoringSession, resumeProctoringMonitoring, requestFullscreenProgrammatically, saveCurrentRecording, saveFinalRecording, setTransitionState, initialSessionId, } = props;
    const { isLoading, setLoadingWithDelay } = useLoadingManager();
    const [testResultId, setTestResultId] = useState<number | null>(null);
    const [testMode, setTestMode] = useState<TestMode>(initialSessionId ? 'main' : 'preliminary');
    const proctoringCleanupRef = useRef<(() => void) | null>(null);
    const mainTestService = useRef(new MainTestService()).current;
    const cleanupProctoring = useCallback(() => {
        if (proctoringCleanupRef.current) {
            console.log('UnifiedTestInterface: Cleaning up proctoring detectors.');
            proctoringCleanupRef.current();
            proctoringCleanupRef.current = null;
        }
    }, []);
    const preliminaryTest = usePreliminaryTest();
    const mainTest = useMainTest(initialSessionId);
    const modal = useModal();
    const [isInitialized, setIsInitialized] = useState(false);
    useEffect(() => {
        if (!isInitialized) {
            console.log('Initializing UnifiedTestInterface - resetting preliminary test state');
            preliminaryTest.resetPreliminaryTest();
            setIsInitialized(true);
        }
    }, [isInitialized]);
    const { isTestAnnulled, annulmentReason, annulTest } = useTestAnnulment(logCheatingEvent, setIsTestActive, cleanupProctoring, pauseProctoringSession, saveCurrentRecording, testMode, preliminaryTest.preliminarySessionId, mainTest.mainSessionId);
    const preliminaryTestTimer = useStableTimer(TIME_LIMITS.PRELIMINARY_TEST, {
        onEnd: () => {
            setTimeout(() => {
                addToast({ type: 'info', message: t('testTimeExpired') });
                setTransitionState(true);
                completePreliminaryTest();
            }, 0);
        },
    });
    const sectionTimer = useStableTimer(0, {
        onEnd: () => {
            setTimeout(() => {
                addToast({
                    type: 'info',
                    message: t('sectionTimeExpired', { section: t(`${mainTest.currentSection}Section`) })
                });
                proceedToNextSection(mainTest.currentSection);
            }, 0);
        },
    });
    useEffect(() => {
        if (!isTestActive)
            return;
        const autoSaveInterval = setInterval(() => {
            console.log('Auto-saving recording...');
            saveCurrentRecording();
        }, TIME_LIMITS.AUTO_SAVE_INTERVAL);
        return () => clearInterval(autoSaveInterval);
    }, [isTestActive, saveCurrentRecording]);
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isTestActive) {
                saveCurrentRecording();
                e.preventDefault();
                e.returnValue = t('testNotCompletedWarning');
                return t('testNotCompletedWarning');
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isTestActive, saveCurrentRecording]);
    useEffect(() => {
        if (isTestActive && !screenState.isScreenShared && screenState.error) {
            annulTest(t('screenShareTerminated'));
        }
    }, [isTestActive, screenState.isScreenShared, screenState.error, annulTest]);
    useEffect(() => {
        if (proctoringState.isTestTerminated && !isTestAnnulled) {
            console.log('Test terminated due to proctoring violations');
            annulTest(proctoringState.error || t('testTerminatedViolations'));
        }
    }, [proctoringState.isTestTerminated, isTestAnnulled, proctoringState.error, annulTest]);
    useEffect(() => {
        if (proctoringState.showFullscreenPrompt) {
            modal.openModal(t('fullscreenExitWarning'), requestFullscreenProgrammatically, t('ok'), undefined);
            setTransitionState(true);
        }
        else if (!proctoringState.showFullscreenPrompt && modal.isConfirmModalOpen &&
            modal.confirmAction === requestFullscreenProgrammatically) {
            modal.closeModal();
            setTimeout(() => setTransitionState(false), UI_CONSTANTS.TRANSITION_DELAYS.MODAL_CLOSE);
        }
    }, [proctoringState.showFullscreenPrompt, requestFullscreenProgrammatically, modal, setTransitionState]);
    useEffect(() => {
        if (testMode === 'preliminary' &&
            isInitialized &&
            !preliminaryTest.preliminaryTestGeneratedRef.current &&
            !preliminaryTest.preliminarySessionId &&
            preliminaryTest.preliminaryTestStatus === 'starting') {
            console.log('Starting preliminary test from useEffect');
            startPreliminaryTest();
        }
        return () => preliminaryTestTimer.stop();
    }, [testMode, isInitialized]);
    useEffect(() => {
        if (testMode === 'main' && !mainTest.mainTestGeneratedRef.current && mainTest.mainSessionId) {
            generateMainTest();
        }
    }, [testMode, mainTest.mainSessionId]);
    useEffect(() => {
        if (testMode === 'main' && mainTest.currentSection !== 'completed' &&
            !isTestAnnulled && mainTest.mainTestData) {
            const timeLimit = TIME_LIMITS.SECTIONS[mainTest.currentSection];
            sectionTimer.reset(timeLimit);
            sectionTimer.start();
        }
        else {
            sectionTimer.stop();
        }
        return () => sectionTimer.stop();
    }, [mainTest.currentSection, isTestAnnulled, mainTest.mainTestData, testMode]);
    const restartPreliminaryTimer = useCallback(() => {
        console.log('Restarting preliminary test timer for new level');
        preliminaryTestTimer.reset(TIME_LIMITS.PRELIMINARY_TEST);
        preliminaryTestTimer.start();
    }, [preliminaryTestTimer]);
    const generateLevelTestWithTimer = useCallback(async (sessionId: number, level: any) => {
        await preliminaryTest.generateLevelTest(sessionId, level);
        restartPreliminaryTimer();
    }, [preliminaryTest.generateLevelTest, restartPreliminaryTimer]);
    const startPreliminaryTest = async () => {
        if (preliminaryTest.preliminarySessionId ||
            preliminaryTest.preliminaryTestStatus !== 'starting' ||
            preliminaryTest.preliminaryTestGeneratedRef.current) {
            console.log('Preliminary test already started, skipping');
            return;
        }
        console.log('Starting preliminary test...');
        await preliminaryTestService.startTest(preliminaryTest.setPreliminarySessionId, setTestResultId, (status: string) => preliminaryTest.setPreliminaryTestStatus(status as any), preliminaryTest.generateLevelTest, restartPreliminaryTimer);
    };
    const handlePreviousQuestion = () => {
        if (preliminaryTest.currentQuestionIndex > 0) {
            preliminaryTest.setCurrentQuestionIndex(preliminaryTest.currentQuestionIndex - 1);
        }
    };
    const handleNextQuestion = () => {
        if (preliminaryTest.currentQuestionIndex < preliminaryTest.allQuestions.length - 1) {
            preliminaryTest.setCurrentQuestionIndex(preliminaryTest.currentQuestionIndex + 1);
        }
        else {
            setTransitionState(true);
            completePreliminaryTest();
        }
    };
    const completePreliminaryTest = async () => {
        if (!preliminaryTest.preliminarySessionId)
            return;
        if (preliminaryTest.preliminaryTestStatus === 'completed' || isLoading) {
            console.log('Preliminary test already completed or in progress, skipping');
            return;
        }
        try {
            setLoadingWithDelay(true);
            setTransitionState(true);
            preliminaryTestTimer.stop();
            const result = await preliminaryTestService.completeTest(preliminaryTest.preliminarySessionId);
            preliminaryTest.setPreliminaryTestResult(result);
            preliminaryTest.setPreliminaryTestStatus('completed');
            await preliminaryTestService.handleTestResult(result, generateLevelTestWithTimer, preliminaryTest.preliminarySessionId, createMainTest, handleElementaryLevelCompletion, handleAdvancedLevelTransition);
        }
        catch (err) {
            console.error('Failed to complete preliminary test:', err);
        }
        finally {
            setLoadingWithDelay(false);
        }
    };
    const handleElementaryLevelCompletion = async (level: string) => {
        try {
            console.log('Test completed with elementary level:', level);
            setTransitionState(true);
            const resultId = preliminaryTest.preliminaryTestResult?.test_result_id;
            if (resultId) {
                setTestResultId(resultId);
            }
            setLoadingWithDelay(false);
            await new Promise(resolve => setTimeout(resolve, UI_CONSTANTS.PRELIMINARY_RESULTS_DELAY));
            setTestMode('main');
            mainTest.setCurrentSection('completed');
        }
        catch (err) {
            console.error('Error handling elementary level completion:', err);
            saveCurrentRecording();
            onTestComplete();
        }
        finally {
            if (level === 'A1' || level === 'A2') {
                console.log('Saving final recording for elementary level:', level);
                try {
                    await saveFinalRecording();
                    console.log('Final recording saved successfully');
                }
                catch (error) {
                    console.error('Failed to save final recording:', error);
                }
                pauseProctoringSession();
            }
            setIsTestActive(false);
            cleanupProctoring();
            setTimeout(() => {
                setTransitionState(false);
            }, UI_CONSTANTS.TRANSITION_DELAYS.ELEMENTARY_COMPLETION);
            setLoadingWithDelay(false);
        }
    };
    const handleAdvancedLevelTransition = async () => {
        setTransitionState(true);
        createMainTest();
    };
    const createMainTest = async () => {
        if (!preliminaryTest.preliminarySessionId || isLoading)
            return;
        try {
            setLoadingWithDelay(true);
            await mainTestService.createTest(preliminaryTest.preliminarySessionId, mainTest.setMainSessionId, setTestResultId, (mode: string) => setTestMode(mode as TestMode), requestFullscreenProgrammatically);
            setTimeout(() => {
                if (!document.fullscreenElement) {
                    console.log('Restoring fullscreen after main test creation');
                    requestFullscreenProgrammatically();
                }
            }, 1000);
        }
        catch (err) {
            console.error('Failed to create main test:', err);
            onTestComplete();
        }
        finally {
            setLoadingWithDelay(false);
            setTimeout(() => {
                setTransitionState(false);
                console.log('Transition state cleared after main test creation');
            }, UI_CONSTANTS.TRANSITION_DELAYS.MAIN_TEST_CREATION);
        }
    };
    const generateMainTest = async () => {
        if (!mainTest.mainSessionId)
            return;
        mainTest.mainTestGeneratedRef.current = true;
        setTransitionState(true);
        setLoadingWithDelay(true);
        try {
            const level = preliminaryTest.preliminaryTestResult?.next_action?.level || 'B1';
            const result = await mainTestService.generateTest(mainTest.mainSessionId, level, mainTest.setMainTestData, (status: string) => mainTest.setMainTestStatus(status as any), mainTest.setIsGeneratingTest, (section: string) => mainTest.setCurrentSection(section as TestSection));
            if (result.isGenerating) {
                setLoadingWithDelay(false);
                console.log('Test generation in background - keeping transition state active');
                return;
            }
            if (result.isElementary) {
                if (result.testResults) {
                    mainTest.setMainTestResults(result.testResults);
                }
            }
            else if (result.testData) {
                sectionTimer.reset(TIME_LIMITS.SECTIONS.reading);
                sectionTimer.start();
            }
        }
        catch (err: any) {
            addToast({ type: 'error', message: t('testGenerationError', { message: err.message }) });
            annulTest(t('testGenerationFailed'));
        }
        finally {
            setLoadingWithDelay(false);
            if (!mainTest.isGeneratingTest) {
                setTimeout(() => {
                    setTransitionState(false);
                    console.log('Transition state cleared after AI test generation (immediate)');
                    resumeProctoringMonitoring();
                }, 2000);
            }
        }
    };
    const handleTestGenerationComplete = useCallback(async () => {
        if (!mainTest.mainSessionId)
            return;
        try {
            const testData = await mainTestService.fetchTestGeneration(mainTest.mainSessionId);
            if (testData) {
                mainTest.setMainTestData(testData);
                mainTest.setMainTestStatus('in_progress');
                mainTest.setIsGeneratingTest(false);
                sectionTimer.reset(TIME_LIMITS.SECTIONS.reading);
                sectionTimer.start();
                setTimeout(() => {
                    setTransitionState(false);
                    console.log('Transition state cleared after successful test generation');
                    resumeProctoringMonitoring();
                }, 1000);
            }
        }
        catch (err: any) {
            handleTestGenerationError(err.message || 'Failed to fetch generated test');
        }
    }, [mainTest.mainSessionId, sectionTimer, resumeProctoringMonitoring, setTransitionState]);
    const handleTestGenerationError = useCallback((error: string) => {
        mainTest.setIsGeneratingTest(false);
        mainTest.setMainTestStatus('error');
        addToast({ type: 'error', message: t('testGenerationError', { message: error }) });
        annulTest(t('testGenerationFailed'));
        setTimeout(() => {
            setTransitionState(false);
            console.log('Transition state cleared after test generation error');
        }, 1000);
    }, [annulTest, setTransitionState]);
    const handleSectionComplete = async (section: TestSection, allQuestionsAnswered: boolean = true) => {
        if (!allQuestionsAnswered) {
            modal.openModal(t('unansweredQuestionsConfirmation'), () => proceedToNextSection(section), t('confirm'), t('cancel'));
            setTransitionState(true);
        }
        else {
            proceedToNextSection(section);
        }
    };
    const proceedToNextSection = async (section: TestSection) => {
        const nextSectionMap: Record<TestSection, TestSection> = {
            reading: 'listening',
            listening: 'writing',
            writing: 'speaking',
            speaking: 'completed',
            completed: 'completed',
        };
        const nextSection = nextSectionMap[section];
        if (nextSection === 'completed') {
            completeMainTest();
        }
        else {
            mainTest.setCurrentSection(nextSection);
            setTimeout(() => {
                setTransitionState(false);
                console.log('Transition state cleared after section change');
            }, UI_CONSTANTS.TRANSITION_DELAYS.SECTION_CHANGE);
        }
    };
    const completeMainTest = async () => {
        if (!mainTest.mainSessionId)
            return;
        setLoadingWithDelay(true);
        sectionTimer.stop();
        setIsTestActive(false);
        setTransitionState(true);
        cleanupProctoring();
        try {
            const testResults = await mainTestService.completeTest(mainTest.mainSessionId, saveFinalRecording);
            mainTest.setMainTestResults(testResults);
            mainTest.setCurrentSection('completed');
        }
        catch (err: any) {
            addToast({ type: 'error', message: err.message || t('testCompletionError') });
        }
        finally {
            pauseProctoringSession();
            setLoadingWithDelay(false);
            setTimeout(() => setTransitionState(false), 1000);
        }
    };
    return (<div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4">
            <LoadingIndicator isVisible={isLoading}/>

            {isTestAnnulled ? (<TestAnnulledStatus reason={annulmentReason} onReturnHome={onTestComplete}/>) : (<>
                    <div className="mb-4">
                        <h1 className="text-2xl font-bold mb-2">{t('englishTest')}</h1>
                    </div>

                    <div className="flex flex-1 overflow-hidden">
                        <div className={`${testMode === 'preliminary' ? 'flex-1 p-4 overflow-y-auto flex flex-col items-center justify-start space-y-4 h-full min-h-0 max-w-4xl mx-auto' : 'w-3/4 p-4 overflow-y-auto flex flex-col items-center justify-start space-y-4 h-full min-h-0'}`}>
                            {testMode === 'preliminary' ? (<PreliminaryTestContainer preliminaryTestStatus={preliminaryTest.preliminaryTestStatus} preliminaryTestData={preliminaryTest.preliminaryTestData} allQuestions={preliminaryTest.allQuestions} currentQuestionIndex={preliminaryTest.currentQuestionIndex} answers={preliminaryTest.answers} timeRemaining={preliminaryTestTimer.time} preliminaryTestResult={preliminaryTest.preliminaryTestResult} onAnswerSubmit={preliminaryTest.handleAnswerSubmit} onPrevious={handlePreviousQuestion} onNext={handleNextQuestion} onContinue={() => { }} onFinish={createMainTest} onLogout={onLogout}/>) : (<MainTestContainer mainSessionId={mainTest.mainSessionId} currentSection={mainTest.currentSection} mainTestData={mainTest.mainTestData} mainTestResults={mainTest.mainTestResults} isGeneratingTest={mainTest.isGeneratingTest} timeRemaining={sectionTimer.time} testResultId={testResultId} preliminaryTestResult={preliminaryTest.preliminaryTestResult} onSectionComplete={handleSectionComplete} onTestGenerationComplete={handleTestGenerationComplete} onTestGenerationError={handleTestGenerationError} onTestComplete={onTestComplete} setMainTestData={mainTest.setMainTestData} proceedToNextSection={proceedToNextSection}/>)}
                        </div>
                        
                        <ProctoringSidebar violationCount={proctoringState.violationCount} isTestTerminated={proctoringState.isTestTerminated} sessionId={testMode === 'preliminary' ?
                (preliminaryTest.preliminarySessionId?.toString() || '') :
                (mainTest.mainSessionId || '')} videoRef={videoRef} canvasRef={canvasRef} onVideoMetadataLoaded={onVideoMetadataLoaded} videoReady={proctoringState.videoReady} proctoringState={proctoringState} screenState={screenState} audioState={audioState} cameraStream={cameraStream}/>
                    </div>
                </>)}

            <ConfirmModal isOpen={modal.isConfirmModalOpen} message={modal.confirmModalMessage} onConfirm={() => {
            if (modal.confirmAction)
                modal.confirmAction();
            modal.closeModal();
            setTimeout(() => setTransitionState(false), UI_CONSTANTS.TRANSITION_DELAYS.MODAL_CLOSE);
        }} onCancel={() => {
            modal.closeModal();
            setTimeout(() => setTransitionState(false), UI_CONSTANTS.TRANSITION_DELAYS.MODAL_CLOSE);
        }} confirmButtonText={modal.confirmButtonText} cancelButtonText={modal.cancelButtonText}/>
        </div>);
}
export default UnifiedTestInterface;

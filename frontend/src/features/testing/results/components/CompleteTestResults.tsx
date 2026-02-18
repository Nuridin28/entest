import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { t } from '@shared/utils/i18n';
import { addToast } from '@shared/utils/toast';
import { completeTestResultsApi } from '@shared/api/api';
import { TestTimeInfo } from '@shared/components/layout/TimeDisplay';
interface CompleteTestResultsProps {
    mainTestId?: string;
    preliminaryResults?: any;
    mainResults?: any;
    onReturnHome: () => void;
    onContinue?: () => void;
}
function CompleteTestResults({ mainTestId, preliminaryResults, mainResults, onReturnHome }: CompleteTestResultsProps) {
    const [results, setResults] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const params = useParams();
    const testId = mainTestId || params.testId;
    useEffect(() => {
        if (preliminaryResults && mainResults) {
            setResults({
                preliminary_test: preliminaryResults,
                main_test: mainResults,
                user_name: mainResults.user_name || "User",
                violations: {
                    preliminary_test: [],
                    main_test: []
                },
                total_violations: 0
            });
            setIsLoading(false);
            return;
        }
        const fetchResults = async () => {
            if (!testId) {
                addToast({ type: 'error', message: 'No test ID provided' });
                return;
            }
            try {
                setIsLoading(true);
                const data = await completeTestResultsApi.getCompleteTestResults(testId);
                setResults(data);
            }
            catch (error: any) {
                console.error('Failed to fetch complete test results:', error);
                addToast({ type: 'error', message: `Failed to load test results: ${error.message}` });
            }
            finally {
                setIsLoading(false);
            }
        };
        fetchResults();
    }, [testId, preliminaryResults, mainResults]);
    if (isLoading) {
        return (<div className="flex items-center justify-center h-64">
                <div className="text-xl font-semibold">{t('loading')}</div>
            </div>);
    }
    if (!results) {
        return (<div className="flex flex-col items-center justify-center h-64 px-4">
                <div className="text-xl font-semibold text-red-600 mb-4 text-center">{t('resultsLoadError')}</div>
                <button onClick={onReturnHome} className="w-full max-w-full sm:max-w-xs bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 sm:px-6 rounded-lg shadow-md transition duration-300 text-sm sm:text-base">
                    <span className="block truncate">{t('returnHome')}</span>
                </button>
            </div>);
    }
    const levelMapping: Record<string, string> = {
        'pre_intermediate': 'A2',
        'intermediate': 'B1',
        'upper_intermediate': 'B2',
        'advanced': 'C1'
    };
    const getCEFRLevelColor = (level: string): string => {
        switch (level) {
            case 'C2': return 'bg-purple-100 text-purple-800';
            case 'C1': return 'bg-blue-100 text-blue-800';
            case 'B2': return 'bg-green-100 text-green-800';
            case 'B1': return 'bg-yellow-100 text-yellow-800';
            case 'A2': return 'bg-orange-100 text-orange-800';
            case 'A1': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };
    const getLowerLevel = (level: string): string => {
        const levelMapping: Record<string, string> = {
            'pre_intermediate': 'A2',
            'intermediate': 'B1',
            'upper_intermediate': 'B2',
            'advanced': 'C1'
        };
        const cefrLevel = levelMapping[level] || level;
        const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
        const currentIndex = levels.indexOf(cefrLevel);
        if (currentIndex <= 0)
            return 'A1';
        return levels[currentIndex - 1];
    };
    return (<div className="max-w-4xl mx-auto space-y-6 p-4">
            
            <div className="text-center bg-white rounded-lg shadow-sm p-8">
                <div className="mb-6">
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-4xl">🎓</span>
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                        {t('completeTestResults')}
                    </h1>
                    <p className="text-gray-800 font-medium">
                        {results.user_name}
                    </p>
                </div>

                <div className="mb-6">
                    
                    {(() => {
            const finalLevel = results.preliminary_test.score_percentage >= 70
                ? levelMapping[results.preliminary_test.current_level] || results.preliminary_test.current_level
                : getLowerLevel(results.preliminary_test.current_level);
            return (<div className={`inline-flex items-center px-6 py-3 rounded-full text-2xl font-bold ${getCEFRLevelColor(finalLevel)}`}>
                                {t('yourLevel', { level: finalLevel })}
                            </div>);
        })()}
                </div>
            </div>

            
            <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">{t('testFlow')}</h2>

                <div className="flex items-center mb-6">
                    <div className="w-full bg-gray-200 h-2 rounded-full">
                        <div className="bg-blue-600 h-2 rounded-full" style={{ width: '100%' }}></div>
                    </div>
                </div>

                <div className="flex justify-between mb-8">
                    <div className="text-center">
                        <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-2 text-white font-bold">1</div>
                        <p className="text-base font-semibold text-gray-900">{t('preliminaryTest')}</p>
                    </div>
                    <div className="text-center">
                        <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-2 text-white font-bold">2</div>
                        <p className="text-base font-semibold text-gray-900">{t('mainTest')} (AI Test)</p>
                    </div>
                </div>

                <p className="text-sm text-gray-900 font-medium mt-2">
                    Note: The AI test is part of the main test and helps determine your final level.
                </p>
            </div>

            
            <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">{t('testTiming')}</h2>
                
                
                {results.preliminary_test?.start_time && (<div className="mb-4 p-4 bg-blue-50 rounded-lg">
                        <h3 className="font-semibold text-gray-800 mb-2">{t('preliminaryTest')}</h3>
                        <TestTimeInfo startTime={results.preliminary_test.start_time} endTime={results.preliminary_test.completed_at}/>
                    </div>)}
                
                
                {results.main_test?.start_time && (<div className="mb-4 p-4 bg-green-50 rounded-lg">
                        <h3 className="font-semibold text-gray-800 mb-2">{t('mainTest')}</h3>
                        <TestTimeInfo startTime={results.main_test.start_time} endTime={results.main_test.end_time}/>
                    </div>)}
            </div>

            
            <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">{t('testResult')}</h2>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <h3 className="font-semibold mb-2 text-gray-800">{t('levelDetermination')}</h3>

                    <div className="space-y-4">
                        
                        <div className="flex items-center">
                            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold mr-3">1</div>
                            <div>
                                <p className="font-medium text-gray-800">
                                    {t('initialLevelTest', { level: results.preliminary_test.current_level })}
                                </p>
                                <p className="text-sm text-gray-700 font-medium">
                                    {results.preliminary_test.score_percentage >= 70
            ? t('passedWithScore', { score: Math.round(results.preliminary_test.score_percentage) })
            : t('failedWithScore', { score: Math.round(results.preliminary_test.score_percentage) })}
                                </p>
                            </div>
                        </div>

                        
                        <div className="flex items-center">
                            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white font-bold mr-3">2</div>
                            <div>
                                <p className="font-medium text-gray-800">
                                    {t('finalLevelDetermined', {
            level: results.preliminary_test.score_percentage >= 70
                ? levelMapping[results.preliminary_test.current_level] || results.preliminary_test.current_level
                : getLowerLevel(results.preliminary_test.current_level)
        })}
                                </p>
                                <p className="text-sm text-gray-700 font-medium">
                                    {results.preliminary_test.score_percentage >= 70
            ? t('aiTestPassed', {
                level: levelMapping[results.preliminary_test.current_level] || results.preliminary_test.current_level
            })
            : t('aiTestFailed', {
                level: getLowerLevel(results.preliminary_test.current_level)
            })}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                
            </div>

            
            <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">{t('violations')}</h2>

                <div className="bg-gray-50 p-4 rounded-lg mb-4">
                    <h3 className="font-medium text-gray-700 mb-2">{t('totalViolations')}</h3>
                    <p className="text-2xl font-bold text-gray-900">{results.total_violations}</p>
                </div>

                

                
            </div>

            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 px-4">
                <button onClick={onReturnHome} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 sm:px-6 rounded-lg shadow-md transition duration-300 text-sm sm:text-base flex-shrink-0 min-w-0 max-w-full sm:max-w-xs mx-auto sm:mx-0">
                    <span className="block truncate">{t('returnHome')}</span>
                </button>
            </div>
        </div>);
}
export default CompleteTestResults;

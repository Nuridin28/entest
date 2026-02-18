import { useState, useEffect } from 'react';
import { t } from '@shared/utils/i18n';
import { addToast } from '@shared/utils/toast';
import { testResultsApi } from '@shared/api/api';
import { formatAlmatyTimeShort } from '@shared/utils/timezone';
interface UnifiedTestResultsProps {
    testResultId: number;
    onReturnHome: () => void;
}
interface TestResult {
    id: number;
    user_id: number;
    user_name: string;
    start_time: string;
    end_time: string;
    status: string;
    final_cefr_level: string;
    final_score: number;
    preliminary_results: any;
    main_test_results: any;
    ai_test_results: any;
    violations_count: number;
    is_invalidated: boolean;
    invalidation_reason: string;
    test_stages: {
        preliminary_completed: boolean;
        main_test_completed: boolean;
        ai_test_completed: boolean;
    };
}
function UnifiedTestResults({ testResultId, onReturnHome }: UnifiedTestResultsProps) {
    const [results, setResults] = useState<TestResult | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    useEffect(() => {
        const fetchResults = async () => {
            try {
                setIsLoading(true);
                const data = await testResultsApi.getTestResult(testResultId);
                setResults(data);
            }
            catch (error: any) {
                console.error('Failed to fetch test results:', error);
                addToast({ type: 'error', message: `Failed to load test results: ${error.message}` });
            }
            finally {
                setIsLoading(false);
            }
        };
        fetchResults();
    }, [testResultId]);
    if (isLoading) {
        return (<div className="flex items-center justify-center h-64">
                <div className="text-xl font-semibold">{t('loading')}</div>
            </div>);
    }
    if (!results) {
        return (<div className="flex flex-col items-center justify-center h-64">
                <div className="text-xl font-semibold text-red-600 mb-4">{t('resultsLoadError')}</div>
                <button onClick={onReturnHome} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg shadow-md transition duration-300">
                    {t('returnHome')}
                </button>
            </div>);
    }
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
    const formatDate = (dateString: string) => {
        return formatAlmatyTimeShort(dateString);
    };
    const getTestStageDescription = () => {
        const stages = [];
        if (results.test_stages.preliminary_completed) {
            stages.push({
                name: t('preliminaryTest'),
                completed: true,
                score: results.preliminary_results?.score_percentage
            });
        }
        const isAiTest = results.preliminary_results?.next_action === 'ai_test';
        if (isAiTest && results.test_stages.main_test_completed) {
            const aiTestScore = results.main_test_results?.final_score ||
                results.final_score ||
                results.ai_test_results?.final_score ||
                0;
            stages.push({
                name: t('aiTest'),
                completed: true,
                score: aiTestScore
            });
        }
        else if (!isAiTest && results.test_stages.main_test_completed) {
            stages.push({
                name: t('mainTest'),
                completed: true,
                score: results.main_test_results?.final_score
            });
        }
        return stages;
    };
    return (<div className="max-w-4xl mx-auto space-y-6 p-4">
            
            <div className="text-center bg-white rounded-lg shadow-sm p-8">
                <div className="mb-6">
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-4xl">🎓</span>
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                        {t('testResults')}
                    </h1>
                    <p className="text-gray-800 font-medium">
                        {results.user_name}
                    </p>
                </div>

                {results.is_invalidated ? (<div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
                        <strong>{t('testInvalidated')}</strong>
                        <p>{results.invalidation_reason}</p>
                    </div>) : (<div className="mb-6">
                        <div className={`inline-flex items-center px-6 py-3 rounded-full text-2xl font-bold ${getCEFRLevelColor(results.final_cefr_level)}`}>
                            {t('yourLevel', { level: results.final_cefr_level })}
                        </div>
                        <p className="text-gray-800 font-medium mt-2">
                            {t('finalScore')}: {Math.round(results.final_score)}%
                        </p>
                    </div>)}
            </div>

            
            <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">{t('testProgress')}</h2>

                <div className="space-y-4">
                    {getTestStageDescription().map((stage, index) => (<div key={index} className="flex items-center">
                            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white font-bold mr-3">
                                ✓
                            </div>
                            <div>
                                <p className="font-semibold text-gray-900">{stage.name}</p>
                                <p className="text-sm text-gray-700 font-medium">
                                    {t('score')}: {Math.round(stage.score)}%
                                </p>
                            </div>
                        </div>))}
                </div>
            </div>

            
            <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">{t('testDetails')}</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <p className="text-sm text-gray-700 font-medium">{t('startTime')}</p>
                        <p className="font-semibold text-gray-900">{formatDate(results.start_time)}</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-700 font-medium">{t('endTime')}</p>
                        <p className="font-semibold text-gray-900">{formatDate(results.end_time)}</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-700 font-medium">{t('status')}</p>
                        <p className="font-semibold text-gray-900 capitalize">{results.status}</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-700 font-medium">{t('violations')}</p>
                        <p className="font-semibold text-gray-900">{results.violations_count}</p>
                    </div>
                </div>
            </div>

            
            {results.preliminary_results && (<div className="bg-white rounded-lg shadow-sm p-6">
                    <h2 className="text-xl font-bold text-gray-900 mb-4">{t('preliminaryTestResults')}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <p className="text-sm text-gray-700 font-medium">{t('testedLevel')}</p>
                            <p className="font-semibold text-gray-900">{results.preliminary_results.current_level}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-700 font-medium">{t('score')}</p>
                            <p className="font-semibold text-gray-900">{Math.round(results.preliminary_results.score_percentage)}%</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-700 font-medium">{t('determinedLevel')}</p>
                            <p className="font-semibold text-gray-900">{results.preliminary_results.determined_level}</p>
                        </div>
                    </div>
                </div>)}

            {results.main_test_results && (<div className="bg-white rounded-lg shadow-sm p-6">
                    <h2 className="text-xl font-bold text-gray-900 mb-4">{t('mainTestResults')}</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <p className="text-sm text-gray-700 font-medium">{t('reading')}</p>
                            <p className="font-semibold text-gray-900">{Math.round(results.main_test_results.reading_score)}%</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-700 font-medium">{t('listening')}</p>
                            <p className="font-semibold text-gray-900">{Math.round(results.main_test_results.listening_score)}%</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-700 font-medium">{t('writing')}</p>
                            <p className="font-semibold text-gray-900">{Math.round(results.main_test_results.writing_score)}%</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-700 font-medium">{t('speaking')}</p>
                            <p className="font-semibold text-gray-900">{Math.round(results.main_test_results.speaking_score)}%</p>
                        </div>
                    </div>
                </div>)}

            <div className="flex justify-center space-x-4">
                <button onClick={onReturnHome} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300">
                    {t('returnHome')}
                </button>
            </div>
        </div>);
}
export default UnifiedTestResults;

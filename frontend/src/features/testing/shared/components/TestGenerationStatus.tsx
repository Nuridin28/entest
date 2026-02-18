import React, { useState, useEffect } from 'react';
import { testApi } from '@shared/api/api';
interface TestGenerationStatusProps {
    sessionId: string;
    onComplete: () => void;
    onError: (error: string) => void;
}
interface GenerationStatus {
    status: 'not_started' | 'generating' | 'completed' | 'error';
    message: string;
    task_id?: string;
    estimated_time?: string;
    estimated_remaining?: string;
    ready?: boolean;
}
const TestGenerationStatus: React.FC<TestGenerationStatusProps> = ({ sessionId, onComplete, onError }) => {
    const [status, setStatus] = useState<GenerationStatus | null>(null);
    const [progress, setProgress] = useState(0);
    const [isPolling, setIsPolling] = useState(false);
    useEffect(() => {
        if (sessionId && !isPolling) {
            startPolling();
        }
    }, [sessionId]);
    const startPolling = async () => {
        setIsPolling(true);
        console.log('Starting polling for session:', sessionId);
        const pollInterval = setInterval(async () => {
            try {
                console.log('Polling generation status for session:', sessionId);
                const response = await testApi.getGenerationStatus(sessionId);
                console.log('Generation status response:', response);
                setStatus(response);
                setProgress(prev => {
                    if (response.status === 'generating') {
                        return Math.min(prev + Math.random() * 10, 90);
                    }
                    else if (response.status === 'completed') {
                        return 100;
                    }
                    return prev;
                });
                if (response.status === 'completed' && response.ready) {
                    console.log('Test generation completed, calling onComplete');
                    clearInterval(pollInterval);
                    setIsPolling(false);
                    setProgress(100);
                    onComplete();
                }
                else if (response.status === 'error') {
                    console.error('Test generation failed:', response.message);
                    clearInterval(pollInterval);
                    setIsPolling(false);
                    onError(response.message || 'Test generation failed');
                }
                else {
                    console.log('Test still generating, status:', response.status);
                }
            }
            catch (error) {
                console.error('Error polling generation status:', error);
                clearInterval(pollInterval);
                setIsPolling(false);
                onError('Failed to check generation status');
            }
        }, 2000);
        return () => {
            clearInterval(pollInterval);
            setIsPolling(false);
        };
    };
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'generating':
                return 'text-blue-600';
            case 'completed':
                return 'text-green-600';
            case 'error':
                return 'text-red-600';
            default:
                return 'text-gray-600';
        }
    };
    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'generating':
                return (<div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>);
            case 'completed':
                return (<svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
          </svg>);
            case 'error':
                return (<svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
          </svg>);
            default:
                return (<div className="h-5 w-5 bg-gray-300 rounded-full"></div>);
        }
    };
    if (!status) {
        return (<div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Checking generation status...</span>
      </div>);
    }
    return (<div className="bg-white rounded-lg shadow-md p-6 max-w-md mx-auto">
      <div className="text-center">
        <div className="flex items-center justify-center mb-4">
          {getStatusIcon(status.status)}
          <h3 className={`ml-3 text-lg font-semibold ${getStatusColor(status.status)}`}>
            Test Generation
          </h3>
        </div>

        <p className="text-gray-600 mb-4">{status.message}</p>

        {status.status === 'generating' && (<div className="mb-4">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              {progress.toFixed(0)}% complete
            </p>
            {status.estimated_remaining && (<p className="text-sm text-gray-500">
                Estimated time remaining: {status.estimated_remaining}
              </p>)}
          </div>)}

        {status.estimated_time && status.status === 'generating' && (<div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
            <p className="text-sm text-blue-700">
              <strong>Estimated total time:</strong> {status.estimated_time}
            </p>
            <p className="text-xs text-blue-600 mt-1">
              We're generating your personalized test using AI. This ensures high-quality, unique questions.
            </p>
          </div>)}

        {status.task_id && (<p className="text-xs text-gray-400 mt-2">
            Task ID: {status.task_id}
          </p>)}

        <div className="mt-4 text-xs text-gray-500">
          <p>✨ AI-powered test generation</p>
          <p>🔄 Real-time progress updates</p>
          <p>⚡ Optimized for performance</p>
        </div>
      </div>
    </div>);
};
export default TestGenerationStatus;

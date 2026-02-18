import { formatTime } from '@shared/utils/testConstants';
interface TestProgressBarProps {
    progress: number;
    timeRemaining?: number;
    showTimer?: boolean;
}
export function TestProgressBar({ progress, timeRemaining, showTimer = true }: TestProgressBarProps) {
    return (<div className="flex items-center mb-4">
            <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}/>
            </div>
            {showTimer && timeRemaining !== undefined && (<div className="ml-4 flex items-center text-lg font-semibold whitespace-nowrap text-gray-700 dark:text-gray-200">
                    <span role="img" aria-label="timer">⏱️</span>
                    <span className="ml-2">{formatTime(timeRemaining)}</span>
                </div>)}
        </div>);
}

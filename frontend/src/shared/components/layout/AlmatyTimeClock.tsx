import React, { useState, useEffect } from 'react';
import { getCurrentAlmatyTime } from '@shared/utils/timezone';
interface AlmatyTimeClockProps {
    className?: string;
    showLabel?: boolean;
    updateInterval?: number;
}
export const AlmatyTimeClock: React.FC<AlmatyTimeClockProps> = ({ className = '', showLabel = true, updateInterval = 1000 }) => {
    const [currentTime, setCurrentTime] = useState<string>(getCurrentAlmatyTime());
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(getCurrentAlmatyTime());
        }, updateInterval);
        return () => clearInterval(interval);
    }, [updateInterval]);
    return (<div className={`flex items-center space-x-2 ${className}`}>
      {showLabel && (<span className="text-sm text-gray-600">Время в Алматы:</span>)}
      <span className="font-mono text-sm font-medium text-gray-800">
        {currentTime}
      </span>
    </div>);
};
interface AlmatyTimeStatusProps {
    className?: string;
}
export const AlmatyTimeStatus: React.FC<AlmatyTimeStatusProps> = ({ className = '' }) => {
    return (<div className={`text-xs text-gray-500 ${className}`}>
      <div className="flex items-center space-x-1">
        <span>🕐</span>
        <span>Все время указано в часовом поясе Алматы (UTC+6)</span>
      </div>
    </div>);
};
export default AlmatyTimeClock;

import React from 'react';
import { getFormattedTime, calculateDuration } from '@shared/utils/timezone';
import type { TimeDisplayProps } from '@shared/utils/timezone';
interface TimeDisplayComponentProps extends TimeDisplayProps {
    className?: string;
    label?: string;
}
export const TimeDisplay: React.FC<TimeDisplayComponentProps> = ({ date, format = 'full', showTimezone = false, className = '', label }) => {
    const formattedTime = getFormattedTime({ date, format, showTimezone });
    return (<span className={className} title={`Время в часовом поясе Алматы: ${formattedTime}`}>
      {label && <span className="font-medium">{label}: </span>}
      {formattedTime}
    </span>);
};
interface DurationDisplayProps {
    startTime: string | Date;
    endTime: string | Date;
    className?: string;
    label?: string;
}
export const DurationDisplay: React.FC<DurationDisplayProps> = ({ startTime, endTime, className = '', label = 'Продолжительность' }) => {
    const duration = calculateDuration(startTime, endTime);
    return (<span className={className}>
      {label && <span className="font-medium">{label}: </span>}
      {duration}
    </span>);
};
interface TestTimeInfoProps {
    startTime: string | Date;
    endTime?: string | Date;
    className?: string;
}
export const TestTimeInfo: React.FC<TestTimeInfoProps> = ({ startTime, endTime, className = '' }) => {
    return (<div className={`space-y-2 ${className}`}>
      <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-1 sm:space-y-0">
        <TimeDisplay date={startTime} format="short" label="Время начала" className="text-sm text-gray-600"/>
        {endTime && (<TimeDisplay date={endTime} format="short" label="Время окончания" className="text-sm text-gray-600"/>)}
      </div>
      {endTime && (<DurationDisplay startTime={startTime} endTime={endTime} className="text-sm text-blue-600 font-medium"/>)}
      <div className="text-xs text-gray-500">
        * Время указано в часовом поясе Алматы (UTC+6)
      </div>
    </div>);
};
export default TimeDisplay;

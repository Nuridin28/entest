import { t } from '@shared/utils/i18n';
interface TestProgressProps {
    current: number;
    total: number;
    className?: string;
}
export function TestProgress({ current, total, className = '' }: TestProgressProps) {
    const percentage = Math.round((current / total) * 100);
    return (<div className={`bg-white rounded-lg shadow-sm p-4 ${className}`}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-600">
          {t('progressOfQuestions', { answered: current, total })}
        </span>
        <span className="text-sm font-medium text-blue-600">{percentage}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${percentage}%` }}/>
      </div>
    </div>);
}
export default TestProgress;

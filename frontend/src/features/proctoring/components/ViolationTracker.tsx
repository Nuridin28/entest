import { t } from '@shared/utils/i18n';
interface ViolationTrackerProps {
    violationCount: number;
    isTestTerminated: boolean;
    sessionId?: string;
}
function ViolationTracker({ violationCount, isTestTerminated }: ViolationTrackerProps) {
    const displayViolationCount = violationCount;
    const getViolationColor = (count: number) => {
        if (count >= 3)
            return 'bg-red-600 animate-pulse';
        if (count >= 2)
            return 'bg-orange-600 animate-pulse';
        if (count >= 1)
            return 'bg-yellow-600';
        return 'bg-green-600';
    };
    const getViolationText = (count: number) => {
        if (isTestTerminated)
            return t('testAnnulledBySystem');
        if (count >= 3)
            return t('criticalRisk');
        if (count >= 2)
            return t('highRisk');
        if (count >= 1)
            return t('mediumRisk');
        return t('lowRisk');
    };
    return (<div className={`w-full rounded-lg shadow-lg border-2 p-4 ${violationCount > 0 ? 'bg-red-100 border-red-500 animate-pulse' : 'bg-white border-gray-200'}`}>
      <div className="flex justify-between items-center mb-3">
        <span className={`text-sm font-bold ${violationCount > 0 ? 'text-red-800' : 'text-gray-800'}`}>{t('violations')}</span>
        <div className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${getViolationColor(displayViolationCount)}`}>
          {getViolationText(displayViolationCount)}
        </div>
      </div>
      <div className={`text-center text-2xl font-bold ${violationCount > 0 ? 'text-red-600' : 'text-gray-900'} ${violationCount >= 1 ? 'animate-pulse' : ''}`}>
        {violationCount} {violationCount === 1 ? t('violation') : t('violationsCount')}
      </div>
      {isTestTerminated && (<p className="text-center text-sm text-red-600 font-medium mt-2">{t('testTerminatedAutomatically')}</p>)}
      
    </div>);
}
export default ViolationTracker;

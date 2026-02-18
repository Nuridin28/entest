import { t } from '@shared/utils/i18n';
interface TestAnnulledStatusProps {
    reason: string;
    onReturnHome: () => void;
}
export function TestAnnulledStatus({ reason, onReturnHome }: TestAnnulledStatusProps) {
    return (<div className="flex flex-col items-center justify-center flex-1 text-center">
            <h2 className="text-3xl font-bold text-red-600 mb-4">{t('testAnnulled')}</h2>
            <p className="text-xl mb-4">{t('reason', { reason })}</p>
            <p className="text-lg mb-6 text-orange-600 font-medium">{t('testAnnulledAttemptCounted')}</p>
            <button onClick={onReturnHome} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 sm:px-6 rounded-lg shadow-md transition duration-300 text-sm sm:text-base min-w-0">
                <span className="truncate">{t('returnHome')}</span>
            </button>
        </div>);
}

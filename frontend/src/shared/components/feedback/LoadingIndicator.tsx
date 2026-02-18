import { t } from '@shared/utils/i18n';
interface LoadingIndicatorProps {
    isVisible: boolean;
}
export function LoadingIndicator({ isVisible }: LoadingIndicatorProps) {
    if (!isVisible)
        return null;
    return (<div className="fixed top-4 right-4 z-50">
            <div className="bg-white rounded-lg shadow-lg border p-3 flex items-center space-x-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"/>
                <span className="text-gray-700 text-sm">{t('loading')}</span>
            </div>
        </div>);
}

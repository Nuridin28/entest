import { t } from '@shared/utils/i18n';
interface SubmitButtonProps {
    onClick: () => void;
    isLoading: boolean;
    disabled?: boolean;
    loadingText?: string;
    children: React.ReactNode;
    className?: string;
}
export function SubmitButton({ onClick, isLoading, disabled = false, loadingText, children, className = '' }: SubmitButtonProps) {
    return (<button onClick={onClick} disabled={isLoading || disabled} className={`px-3 sm:px-6 py-2 sm:py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm sm:text-base min-w-0 ${className}`}>
      <span className="block truncate">
        {isLoading ? (loadingText || t('submitting')) : children}
      </span>
    </button>);
}
export default SubmitButton;

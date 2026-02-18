import { t } from '@shared/utils/i18n';
interface QuestionNavigationProps {
    currentIndex: number;
    totalQuestions: number;
    onPrevious: () => void;
    onNext: () => void;
    disabled?: boolean;
    disabledReason?: string;
}
export function QuestionNavigation({ currentIndex, totalQuestions, onPrevious, onNext, disabled = false, disabledReason }: QuestionNavigationProps) {
    return (<div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
      <h3 className="text-base sm:text-lg font-semibold text-gray-900 min-w-0 flex-shrink-0">
        <span className="truncate">
          {t('questionOutOf', { current: currentIndex + 1, total: totalQuestions })}
        </span>
      </h3>
      <div className="flex space-x-2 flex-shrink-0">
        <button onClick={onPrevious} disabled={currentIndex === 0 || disabled} className="px-3 py-2 text-xs sm:text-sm font-medium text-gray-800 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 focus:z-10 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed min-w-0" title={disabled ? disabledReason : ''}>
          <span className="truncate">{t('back')}</span>
        </button>
        <button onClick={onNext} disabled={currentIndex === totalQuestions - 1 || disabled} className="px-3 py-2 text-xs sm:text-sm font-medium text-gray-800 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 focus:z-10 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed min-w-0" title={disabled ? disabledReason : ''}>
          <span className="truncate">{t('forward')}</span>
        </button>
      </div>
    </div>);
}
export default QuestionNavigation;

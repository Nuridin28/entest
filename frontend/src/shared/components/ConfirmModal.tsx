import { t } from '@shared/utils/i18n';
interface ConfirmModalProps {
    isOpen: boolean;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmButtonText?: string;
    cancelButtonText?: string;
}
function ConfirmModal({ isOpen, message, onConfirm, onCancel, confirmText, cancelText, confirmButtonText, cancelButtonText, }: ConfirmModalProps) {
    if (!isOpen)
        return null;
    const actualConfirmText = confirmButtonText ?? confirmText ?? t('confirm');
    const actualCancelText = cancelButtonText ?? cancelText;
    return (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-sm w-full p-6 space-y-4">
        <p className="text-gray-800 dark:text-gray-100 text-sm whitespace-pre-line">{message}</p>
        <div className="flex justify-end space-x-3">
          {actualCancelText !== undefined && actualCancelText !== null && (<button onClick={onCancel} className="px-3 sm:px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 text-xs sm:text-sm min-w-0">
              <span className="truncate">{actualCancelText}</span>
            </button>)}
          <button onClick={onConfirm} className="px-3 sm:px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm min-w-0">
            <span className="truncate">{actualConfirmText}</span>
          </button>
        </div>
      </div>
    </div>);
}
export default ConfirmModal;

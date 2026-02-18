import { useState, useCallback } from 'react';
export function useModal() {
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [confirmModalMessage, setConfirmModalMessage] = useState('');
    const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
    const [confirmButtonText, setConfirmButtonText] = useState<string | undefined>(undefined);
    const [cancelButtonText, setCancelButtonText] = useState<string | undefined>(undefined);
    const openModal = useCallback((message: string, action: () => void, confirmText?: string, cancelText?: string) => {
        setConfirmModalMessage(message);
        setConfirmAction(() => action);
        setConfirmButtonText(confirmText);
        setCancelButtonText(cancelText);
        setIsConfirmModalOpen(true);
    }, []);
    const closeModal = useCallback(() => {
        setIsConfirmModalOpen(false);
    }, []);
    return {
        isConfirmModalOpen,
        confirmModalMessage,
        confirmAction,
        confirmButtonText,
        cancelButtonText,
        openModal,
        closeModal,
    };
}

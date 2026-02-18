import { useState, useRef, useCallback, createContext, useContext, useEffect } from 'react';
import type { ReactNode } from 'react';
import { type ToastMessage, type ToastType, setToastFunction, setToastVisibilityStatus } from '../../shared/utils/toast';
interface ToastContextType {
    addToast: (message: string, type: ToastType) => void;
    removeToast: (id: number) => void;
    toasts: ToastMessage[];
}
const ToastContext = createContext<ToastContextType | undefined>(undefined);
export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return context;
};
interface ToastProviderProps {
    children: ReactNode;
}
function ToastContainer({ toasts, removeToast }: {
    toasts: ToastMessage[];
    removeToast: (id: number) => void;
}) {
    const getToastStyle = (type: ToastType) => {
        switch (type) {
            case 'success': return 'bg-green-500';
            case 'error': return 'bg-red-500';
            case 'warning': return 'bg-yellow-500';
            case 'info': return 'bg-blue-500';
        }
    };
    return (<div className="fixed top-5 right-5 z-50 space-y-2">
      {toasts.map(toast => (<div key={toast.id} className={`px-4 py-2 text-white rounded-md shadow-lg flex items-center justify-between ${getToastStyle(toast.type)}`}>
          <span>{toast.message}</span>
          <button onClick={() => removeToast(toast.id)} className="ml-4 text-white font-bold">X</button>
        </div>))}
    </div>);
}
export function ToastProvider({ children }: ToastProviderProps) {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const nextToastId = useRef(0);
    const removeToast = useCallback((id: number) => {
        setToasts(currentToasts => {
            const updatedToasts = currentToasts.filter(t => t.id !== id);
            if (updatedToasts.length === 0) {
                setToastVisibilityStatus(false);
            }
            return updatedToasts;
        });
    }, []);
    const addToast = useCallback((message: string, type: ToastType) => {
        const isDuplicate = toasts.some(t => t.message === message &&
            t.type === type &&
            t.addedAt !== undefined && Date.now() - t.addedAt < 2000);
        if (isDuplicate) {
            console.log('Предотвращено дублирование уведомления:', message);
            return;
        }
        const id = nextToastId.current++;
        const newToast: ToastMessage = { id, message, type, addedAt: Date.now() };
        setToastVisibilityStatus(true);
        setToasts(prev => [...prev, newToast]);
        setTimeout(() => {
            removeToast(id);
        }, 5000);
    }, [toasts, removeToast]);
    useEffect(() => {
        setToastFunction((toast) => {
            addToast(toast.message, toast.type);
        });
    }, [addToast]);
    return (<ToastContext.Provider value={{ addToast, removeToast, toasts }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast}/>
    </ToastContext.Provider>);
}

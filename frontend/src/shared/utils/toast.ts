export type ToastType = 'success' | 'error' | 'warning' | 'info';
export interface ToastMessage {
    id: number;
    type: ToastType;
    message: string;
    addedAt?: number;
}
type AddToastFunction = (toast: Omit<ToastMessage, 'id'>) => void;
let addToastFunction: AddToastFunction = () => {
    console.warn("addToastFunction not initialized. Call setToastFunction first.");
};
let isAnyToastVisible: boolean = false;
export function setToastFunction(fn: AddToastFunction) {
    addToastFunction = fn;
}
export function addToast(toast: Omit<ToastMessage, 'id'>) {
    isAnyToastVisible = true;
    addToastFunction(toast);
}
export function setToastVisibilityStatus(isVisible: boolean) {
    isAnyToastVisible = isVisible;
}
export function getToastVisibilityStatus(): boolean {
    return isAnyToastVisible;
}

export interface ToastMessage {
    id: number;
    text: string;
    type: 'success' | 'error' | 'info';
}

export class ToastService {
    toasts: ToastMessage[] = [];
}
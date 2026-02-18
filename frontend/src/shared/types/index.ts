export interface User {
    id: string;
    email: string;
    name: string;
    role: 'user' | 'admin';
}
export interface TestResult {
    id: string;
    userId: string;
    testType: 'preliminary' | 'complete';
    score: number;
    maxScore: number;
    completedAt: string;
}
export interface Question {
    id: string;
    type: 'multiple_choice' | 'true_false' | 'text' | 'audio';
    question: string;
    options?: string[];
    correctAnswer: string | number;
}
export interface TestSection {
    id: string;
    name: string;
    questions: Question[];
    timeLimit?: number;
}
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}
export interface LoadingState {
    isLoading: boolean;
    error: string | null;
}

export interface TestResult {
    id: string;
    user_id: string;
    test_type: 'preliminary' | 'complete';
    test_id: string;
    total_score: number;
    max_score: number;
    percentage: number;
    level?: string;
    completed_at: string;
    sections?: SectionResult[];
}
export interface SectionResult {
    name: string;
    score: number;
    max_score: number;
    percentage: number;
    time_spent: number;
    questions_answered: number;
    total_questions: number;
}
export interface ResultSummary {
    test_type: string;
    total_attempts: number;
    best_score: number;
    average_score: number;
    last_attempt_date: string;
}
export interface DetailedResult extends TestResult {
    questions: QuestionResult[];
    time_spent: number;
    violations?: ViolationResult[];
}
export interface QuestionResult {
    id: string;
    question: string;
    user_answer: string | number;
    correct_answer: string | number;
    is_correct: boolean;
    points_earned: number;
    max_points: number;
}
export interface ViolationResult {
    type: string;
    timestamp: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
}

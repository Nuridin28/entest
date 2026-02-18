export interface CompleteTest {
    id: string;
    user_id: string;
    sections: TestSection[];
    started_at: string;
    completed_at?: string;
    total_score?: number;
    max_score: number;
    status: 'in_progress' | 'completed' | 'abandoned';
}
export interface TestSection {
    id: string;
    name: 'reading' | 'listening' | 'writing' | 'speaking';
    questions: TestQuestion[];
    time_limit: number;
    completed_at?: string;
    score?: number;
    max_score: number;
}
export interface TestQuestion {
    id: string;
    type: 'multiple_choice' | 'text' | 'audio' | 'essay';
    question: string;
    content?: string;
    audio_url?: string;
    options?: string[];
    correct_answer?: string | number;
    user_answer?: string | number;
    points: number;
}
export interface SectionResult {
    section_name: string;
    score: number;
    max_score: number;
    percentage: number;
    time_spent: number;
    questions_answered: number;
    total_questions: number;
}

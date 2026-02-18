export interface PreliminaryTest {
    id: string;
    user_id: string;
    questions: PreliminaryQuestion[];
    started_at: string;
    completed_at?: string;
    score?: number;
    max_score: number;
}
export interface PreliminaryQuestion {
    id: string;
    type: 'grammar' | 'vocabulary' | 'reading';
    question: string;
    options?: string[];
    correct_answer: string | number;
    user_answer?: string | number;
    level: 'beginner' | 'pre_intermediate' | 'intermediate' | 'upper_intermediate' | 'advanced';
}
export interface PreliminaryResult {
    test_id: string;
    total_score: number;
    max_score: number;
    percentage: number;
    level: string;
    sections: {
        grammar: {
            score: number;
            max_score: number;
        };
        vocabulary: {
            score: number;
            max_score: number;
        };
        reading: {
            score: number;
            max_score: number;
        };
    };
}

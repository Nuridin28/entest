export interface AdminUser {
    id: string;
    email: string;
    name: string;
    is_superuser: boolean;
    created_at: string;
}
export interface UserAttempt {
    id: string;
    user_id: string;
    test_type: string;
    score: number;
    max_score: number;
    started_at: string;
    completed_at?: string;
    status: 'in_progress' | 'completed' | 'abandoned';
}
export interface SystemStats {
    total_users: number;
    active_tests: number;
    completed_tests: number;
    system_health: 'healthy' | 'warning' | 'error';
}

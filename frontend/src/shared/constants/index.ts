export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
export const TEST_TYPES = {
    PRELIMINARY: 'preliminary',
    COMPLETE: 'complete'
} as const;
export const QUESTION_TYPES = {
    MULTIPLE_CHOICE: 'multiple_choice',
    TRUE_FALSE: 'true_false',
    TEXT: 'text',
    AUDIO: 'audio'
} as const;
export const USER_ROLES = {
    USER: 'user',
    ADMIN: 'admin'
} as const;
export const ROUTES = {
    HOME: '/',
    AUTH: '/auth',
    TEST: '/test',
    RESULTS: '/results',
    ADMIN: '/admin'
} as const;
export const TIME_LIMITS = {
    PRELIMINARY_TEST: 30 * 60,
    COMPLETE_TEST: 120 * 60,
    SPEAKING_SECTION: 15 * 60,
    WRITING_SECTION: 60 * 60
} as const;

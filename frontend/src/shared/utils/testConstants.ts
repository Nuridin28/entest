export const TIME_LIMITS = {
    PRELIMINARY_TEST: 15 * 60,
    SECTIONS: {
        reading: 20 * 60,
        listening: 20 * 60,
        writing: 25 * 60,
        speaking: 15 * 60,
        completed: 0,
    } as Record<string, number>,
    AUTO_SAVE_INTERVAL: 90000,
    LOADING_DELAY: 100,
} as const;
export const UI_CONSTANTS = {
    TRANSITION_DELAYS: {
        DEFAULT: 500,
        MODAL_CLOSE: 500,
        SECTION_CHANGE: 500,
        ELEMENTARY_COMPLETION: 5000,
        MAIN_TEST_CREATION: 10000,
        AI_TEST_GENERATION: 15000,
    },
    PRELIMINARY_RESULTS_DELAY: 6000,
    AUTO_RETRY_INTERVAL: 3000,
} as const;
export function formatTime(seconds: number): string {
    if (seconds < 0)
        seconds = 0;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}
export function msToSeconds(ms: number): number {
    return Math.floor(ms / 1000);
}
export function secondsToMs(seconds: number): number {
    return seconds * 1000;
}

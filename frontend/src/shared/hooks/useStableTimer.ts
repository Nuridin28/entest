import { useState, useEffect, useRef, useCallback } from 'react';
type TimerState = 'running' | 'paused' | 'stopped';
interface TimerOptions {
    onTick?: (time: number) => void;
    onEnd?: () => void;
}
export function useStableTimer(initialTime: number, options: TimerOptions = {}) {
    const [time, setTime] = useState(initialTime);
    const [timerState, setTimerState] = useState<TimerState>('stopped');
    const timerRef = useRef<number | null>(null);
    const lastTickTimestamp = useRef<number | null>(null);
    const optionsRef = useRef(options);
    optionsRef.current = options;
    const tick = useCallback((timestamp: number) => {
        if (timerState !== 'running')
            return;
        if (!lastTickTimestamp.current) {
            lastTickTimestamp.current = timestamp;
            timerRef.current = requestAnimationFrame(tick);
            return;
        }
        const elapsed = timestamp - lastTickTimestamp.current;
        if (elapsed >= 1000) {
            lastTickTimestamp.current = timestamp;
            setTime(prevTime => {
                const newTime = prevTime - 1;
                if (optionsRef.current.onTick)
                    optionsRef.current.onTick(newTime);
                if (newTime <= 0) {
                    if (optionsRef.current.onEnd)
                        optionsRef.current.onEnd();
                    setTimerState('stopped');
                    return 0;
                }
                return newTime;
            });
        }
        timerRef.current = requestAnimationFrame(tick);
    }, [timerState]);
    useEffect(() => {
        if (timerState === 'running') {
            lastTickTimestamp.current = performance.now();
            timerRef.current = requestAnimationFrame(tick);
        }
        else {
            if (timerRef.current)
                cancelAnimationFrame(timerRef.current);
        }
        return () => {
            if (timerRef.current)
                cancelAnimationFrame(timerRef.current);
        };
    }, [timerState, tick]);
    const start = useCallback(() => setTimerState('running'), []);
    const pause = useCallback(() => setTimerState('paused'), []);
    const stop = useCallback(() => {
        setTimerState('stopped');
        setTime(initialTime);
    }, [initialTime]);
    const reset = useCallback((newTime: number) => {
        setTimerState('stopped');
        setTime(newTime);
    }, []);
    return { time, start, pause, stop, reset, timerState };
}

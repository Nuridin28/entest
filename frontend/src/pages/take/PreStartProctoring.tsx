import { useEffect, useRef, useState } from 'react';
import { externalAttemptsApi } from '../../shared/api/externalTests';

interface Props {
    token: string;
    title: string;
    onReady: () => void;
}

export const PreStartProctoring = ({ token, title, onReady }: Props) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const [phase, setPhase] = useState<'idle' | 'asking' | 'preview' | 'captured' | 'saving' | 'error'>('idle');
    const [photoData, setPhotoData] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [ack, setAck] = useState(false);

    const start = async () => {
        setError(null);
        setPhase('asking');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }
            setPhase('preview');
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Не удалось получить доступ к камере');
            setPhase('error');
        }
    };

    const capture = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const v = videoRef.current;
        const c = canvasRef.current;
        c.width = v.videoWidth || 640;
        c.height = v.videoHeight || 480;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const data = c.toDataURL('image/jpeg', 0.85);
        setPhotoData(data);
        setPhase('captured');
    };

    const retake = () => {
        setPhotoData(null);
        setPhase('preview');
    };

    const confirm = async () => {
        if (!photoData) return;
        setPhase('saving');
        try {
            await externalAttemptsApi.savePhoto(token, photoData);
            // stop camera before handing over
            streamRef.current?.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
            // enter fullscreen on user gesture
            try {
                await document.documentElement.requestFullscreen();
            } catch (_) {/* user denied, ok */}
            onReady();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Не удалось сохранить фото');
            setPhase('captured');
        }
    };

    useEffect(() => {
        return () => {
            streamRef.current?.getTracks().forEach((t) => t.stop());
        };
    }, []);

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-md max-w-2xl w-full p-6 md:p-8">
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">{title}</h1>
                <p className="text-sm text-gray-600 mt-1">Перед началом прохождения теста нужно подтвердить личность.</p>

                <ol className="text-sm text-gray-700 space-y-1.5 mt-5 list-decimal pl-5">
                    <li>Разрешите доступ к веб-камере и сделайте снимок лица.</li>
                    <li>Тест откроется в полноэкранном режиме — не сворачивайте окно и не переключайте вкладки.</li>
                    <li>Каждое нарушение (выход из полноэкранного режима, смена вкладки и т.п.) фиксируется и видно проктору.</li>
                </ol>

                {error && (
                    <div className="mt-5 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
                )}

                <div className="mt-6 rounded-lg overflow-hidden bg-gray-900 aspect-video flex items-center justify-center">
                    {phase === 'idle' && (
                        <div className="text-white/60 text-sm text-center px-6">Нажмите кнопку ниже, чтобы включить камеру</div>
                    )}
                    {phase === 'asking' && <div className="text-white text-sm">Запрашиваем доступ...</div>}
                    {(phase === 'preview' || phase === 'captured' || phase === 'saving') && !photoData && (
                        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                    )}
                    {photoData && (
                        <img src={photoData} alt="initial photo" className="w-full h-full object-cover" />
                    )}
                    <canvas ref={canvasRef} className="hidden" />
                </div>

                <label className="flex items-start gap-2 mt-5 text-sm text-gray-700 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={ack}
                        onChange={(e) => setAck(e.target.checked)}
                        className="mt-0.5 w-4 h-4 accent-blue-600"
                    />
                    <span>Я понимаю правила прохождения и согласен(на) на запись нарушений.</span>
                </label>

                <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    {phase === 'idle' || phase === 'error' ? (
                        <button
                            onClick={start}
                            disabled={!ack}
                            className="px-6 py-2.5 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-40"
                        >
                            Включить камеру
                        </button>
                    ) : phase === 'preview' ? (
                        <button
                            onClick={capture}
                            disabled={!ack}
                            className="px-6 py-2.5 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-40"
                        >
                            Сделать снимок
                        </button>
                    ) : phase === 'captured' || phase === 'saving' ? (
                        <>
                            <button
                                onClick={retake}
                                disabled={phase === 'saving' || !ack}
                                className="px-5 py-2.5 rounded-md border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50"
                            >
                                Переснять
                            </button>
                            <button
                                onClick={confirm}
                                disabled={phase === 'saving' || !ack}
                                className="px-6 py-2.5 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-40"
                            >
                                {phase === 'saving' ? 'Сохраняем...' : 'Начать тест'}
                            </button>
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

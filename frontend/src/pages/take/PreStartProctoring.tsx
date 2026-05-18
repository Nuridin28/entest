import { useEffect, useRef, useState } from 'react';
import { externalAttemptsApi } from '../../shared/api/externalTests';

interface Props {
    token: string;
    title: string;
    onRequestScreen: () => Promise<MediaStream | null>;
    onReady: (cam: MediaStream, screen: MediaStream) => Promise<void>;
}

type Phase = 'idle' | 'asking' | 'preview' | 'captured' | 'screen' | 'saving' | 'error';

export const PreStartProctoring = ({ token, title, onRequestScreen, onReady }: Props) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);

    const [phase, setPhase] = useState<Phase>('idle');
    const [photoData, setPhotoData] = useState<string | null>(null);
    const [screenOk, setScreenOk] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [ack, setAck] = useState(false);

    // Attach stream to video element when phase becomes 'preview'
    useEffect(() => {
        if (phase !== 'preview' || !streamRef.current || !videoRef.current) return;
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play().catch(() => {});
    }, [phase]);

    const startCamera = async () => {
        setError(null);
        setPhase('asking');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true });
            streamRef.current = stream;
            setPhase('preview');
        } catch (e: unknown) {
            const name = e instanceof Error ? (e as DOMException).name : '';
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
                setError('Браузер заблокировал доступ к камере. Нажмите на иконку камеры в адресной строке и разрешите доступ, затем обновите страницу.');
            } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
                setError('Камера не найдена. Подключите камеру и попробуйте снова.');
            } else if (name === 'NotReadableError' || name === 'TrackStartError') {
                setError('Камера используется другим приложением. Закройте его и попробуйте снова.');
            } else {
                setError('Не удалось получить доступ к камере. Проверьте разрешения браузера и попробуйте снова.');
            }
            setPhase('error');
        }
    };

    const capture = () => {
        const v = videoRef.current;
        const c = canvasRef.current;
        if (!v || !c) return;
        c.width = v.videoWidth || 640;
        c.height = v.videoHeight || 480;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(v, 0, 0, c.width, c.height);
        setPhotoData(c.toDataURL('image/jpeg', 0.85));
        setPhase('captured');
    };

    const retake = () => {
        setPhotoData(null);
        setPhase('preview');
    };

    // Direct button click → user gesture → getDisplayMedia is allowed
    const shareScreen = async () => {
        setError(null);
        const stream = await onRequestScreen();
        if (stream) {
            screenStreamRef.current = stream;
            setScreenOk(true);
            setPhase('screen');
        } else {
            setError('Не удалось получить доступ к экрану. Выберите весь экран и попробуйте снова.');
        }
    };

    // Network request is safe here — screen already obtained, camera already running
    const confirm = async () => {
        if (!photoData || !screenOk || !streamRef.current || !screenStreamRef.current) return;
        const cam = streamRef.current;
        const screen = screenStreamRef.current;
        setPhase('saving');
        try {
            await externalAttemptsApi.savePhoto(token, photoData);
            // Clear ref before calling onReady so the cleanup effect doesn't stop the stream
            // (parent takes ownership of both streams after this point)
            streamRef.current = null;
            await onReady(cam, screen);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Не удалось сохранить фото');
            setPhase('screen');
        }
    };

    useEffect(() => {
        return () => { streamRef.current?.getTracks().forEach(t => t.stop()); };
    }, []);

    const showVideo = (phase === 'preview' || phase === 'captured' || phase === 'screen' || phase === 'saving') && !photoData;

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-md max-w-2xl w-full p-6 md:p-8">
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">{title}</h1>
                <p className="text-sm text-gray-600 mt-1">Перед началом теста нужно подтвердить личность и разрешить запись экрана.</p>

                <ol className="text-sm text-gray-700 space-y-1.5 mt-5 list-decimal pl-5">
                    <li>Включите камеру и сделайте снимок лица.</li>
                    <li>Разрешите запись экрана (выберите «Весь экран»).</li>
                    <li>Тест откроется в полноэкранном режиме — не сворачивайте окно.</li>
                </ol>

                {error && (
                    <div className="mt-5 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
                )}

                <div className="mt-6 rounded-lg overflow-hidden bg-gray-900 aspect-video relative flex items-center justify-center">
                    <video
                        ref={videoRef}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                        style={{ display: showVideo ? 'block' : 'none' }}
                    />
                    {photoData && (
                        <img src={photoData} alt="фото" className="absolute inset-0 w-full h-full object-cover" />
                    )}
                    {phase === 'idle' && (
                        <div className="absolute text-white/60 text-sm text-center px-6">
                            Нажмите «Включить камеру»
                        </div>
                    )}
                    {phase === 'asking' && (
                        <div className="absolute text-white text-sm">Запрашиваем доступ к камере...</div>
                    )}
                    <canvas ref={canvasRef} className="hidden" />
                </div>

                {/* Progress steps */}
                <div className="mt-4 flex items-center gap-3 text-xs text-gray-500">
                    <Step done={!!photoData} active={phase === 'preview'} n={1} label="Снимок лица" />
                    <div className="flex-1 h-px bg-gray-200" />
                    <Step done={screenOk} active={phase === 'captured'} n={2} label="Запись экрана" />
                    <div className="flex-1 h-px bg-gray-200" />
                    <Step done={false} active={phase === 'screen'} n={3} label="Начать тест" />
                </div>

                <label className="flex items-start gap-2 mt-5 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} className="mt-0.5 w-4 h-4 accent-blue-600" />
                    <span>Я согласен(на) на запись нарушений и видеозапись экрана.</span>
                </label>

                <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    {(phase === 'idle' || phase === 'error') && (
                        <button onClick={startCamera} disabled={!ack}
                            className="px-6 py-2.5 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-40">
                            Включить камеру
                        </button>
                    )}
                    {phase === 'preview' && (
                        <button onClick={capture} disabled={!ack}
                            className="px-6 py-2.5 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-40">
                            Сделать снимок
                        </button>
                    )}
                    {phase === 'captured' && (
                        <>
                            <button onClick={retake}
                                className="px-5 py-2.5 rounded-md border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition">
                                Переснять
                            </button>
                            <button onClick={shareScreen} disabled={!ack}
                                className="px-6 py-2.5 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-40">
                                Расшарить экран
                            </button>
                        </>
                    )}
                    {phase === 'screen' && (
                        <>
                            <button onClick={() => { setScreenOk(false); setPhase('captured'); }}
                                className="px-5 py-2.5 rounded-md border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition">
                                Назад
                            </button>
                            <button onClick={confirm} disabled={!ack || phase === 'saving'}
                                className="px-6 py-2.5 rounded-md bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition disabled:opacity-40">
                                Начать тест
                            </button>
                        </>
                    )}
                    {phase === 'saving' && (
                        <button disabled className="px-6 py-2.5 rounded-md bg-gray-400 text-white text-sm font-semibold">
                            Запускаем...
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

function Step({ done, active, n, label }: { done: boolean; active: boolean; n: number; label: string }) {
    return (
        <div className="flex items-center gap-1.5 shrink-0">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold
                ${done ? 'bg-green-500 text-white' : active ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {done ? '✓' : n}
            </div>
            <span className={done ? 'text-green-600' : active ? 'text-blue-600' : ''}>{label}</span>
        </div>
    );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { externalAttemptsApi, type AttemptStart } from '../../shared/api/externalTests';
import { PreStartProctoring } from './PreStartProctoring';
import { useExternalProctoring } from './useExternalProctoring';
import { ExternalProctoringPanel } from './ExternalProctoringPanel';

type AnswerMap = Record<number, unknown>;

export const TakePage = () => {
    const [params] = useSearchParams();
    const token = params.get('token') || '';

    const [data, setData] = useState<AttemptStart | null>(null);
    const [answers, setAnswers] = useState<AnswerMap>({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<{ score: number; status: string } | null>(null);
    const [ready, setReady] = useState(false);

    // Always in DOM so refs are valid when onReady fires (before setReady(true))
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const isTestActive = ready && !done;

    const {
        state: procState,
        cameraStream,
        injectCameraStream,
        requestScreenStream,
        startMonitoring,
        stopProctoring,
    } = useExternalProctoring({ token, isTestActive, videoRef, canvasRef });

    useEffect(() => {
        if (!token) { setError('Ссылка не валидна — отсутствует токен'); setLoading(false); return; }
        (async () => {
            try {
                const d = await externalAttemptsApi.start(token);
                setData(d);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : 'Не удалось открыть тест');
            } finally {
                setLoading(false);
            }
        })();
    }, [token]);

    // Both streams already obtained by PreStartProctoring — no extra getUserMedia needed.
    const handleReady = async (cam: MediaStream, screen: MediaStream) => {
        injectCameraStream(cam);
        if (videoRef.current) {
            videoRef.current.srcObject = cam;
            await videoRef.current.play().catch(() => {});
        }
        startMonitoring(cam, screen);
        setReady(true);
    };

    const setAnswer = (qid: number, value: unknown) => setAnswers((a) => ({ ...a, [qid]: value }));

    const submit = async () => {
        if (!data) return;
        setSubmitting(true);
        setError(null);
        try {
            const payload = data.questions.map((q) => ({ question_id: q.id, answer: answers[q.id] ?? null }));
            const result = await externalAttemptsApi.submit(token, payload);
            stopProctoring();
            setDone({ score: result.score, status: result.status });
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Ошибка отправки');
        } finally {
            setSubmitting(false);
        }
    };

    const sortedQuestions = useMemo(() => {
        return data ? [...data.questions].sort((a, b) => a.order_number - b.order_number) : [];
    }, [data]);

    // Hidden video/canvas only when sidebar isn't showing them (pre-test phases)
    const hiddenMedia = !isTestActive ? (
        <>
            <video ref={videoRef} autoPlay muted playsInline style={{ display: 'none' }} />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
        </>
    ) : null;


    if (loading) return <>{hiddenMedia}<div className="min-h-screen flex items-center justify-center">Загрузка...</div></>;
    if (error)
        return (
            <>{hiddenMedia}
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className="bg-red-50 border border-red-200 text-red-700 rounded p-4 max-w-md">{error}</div>
            </div></>
        );
    if (data && !ready && !done) {
        return <>{hiddenMedia}<PreStartProctoring token={token} title={data.title} onRequestScreen={requestScreenStream} onReady={handleReady} /></>;
    }
    if (procState.isTerminated && !done) {
        return (
            <>{hiddenMedia}
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className="bg-red-50 border border-red-200 text-red-700 rounded p-4 max-w-md text-center">
                    <h2 className="font-semibold text-lg mb-2">Тест прерван</h2>
                    <p>Зафиксировано слишком много нарушений прокторинга. Тест был завершён автоматически.</p>
                </div>
            </div></>
        );
    }
    if (done) {
        return (
            <>{hiddenMedia}
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className="bg-white rounded shadow p-8 max-w-md text-center">
                    <h2 className="text-2xl font-semibold mb-2">Тест завершён</h2>
                    <div className="text-gray-600 mb-4">Статус: {done.status}</div>
                    <div className="text-4xl font-bold text-blue-600">{done.score}%</div>
                    <p className="text-sm text-gray-500 mt-4">Окно можно закрыть.</p>
                </div>
            </div></>
        );
    }
    if (!data) return <>{hiddenMedia}</>;

    return (
        <div className="min-h-screen bg-gray-50">
            {hiddenMedia}

            {/* Questions — full width with right padding for the fixed panel */}
            <div className="pr-64 p-6 max-w-none">
                <h1 className="text-3xl font-semibold mb-2">{data.title}</h1>
                {data.description && <p className="text-gray-600 mb-6">{data.description}</p>}

                <div className="space-y-4">
                    {sortedQuestions.map((q, idx) => (
                        <div key={q.id} className="bg-white rounded shadow p-5">
                            <div className="font-medium mb-3">
                                {idx + 1}. {q.content}
                            </div>

                            {q.question_type === 'mcq' && Array.isArray(q.options) && (
                                <div className="space-y-2">
                                    {q.options.map((opt, oi) => (
                                        <label key={oi} className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name={`q-${q.id}`}
                                                checked={answers[q.id] === opt}
                                                onChange={() => setAnswer(q.id, opt)}
                                            />
                                            <span>{String(opt)}</span>
                                        </label>
                                    ))}
                                </div>
                            )}

                            {q.question_type === 'multi' && Array.isArray(q.options) && (
                                <div className="space-y-2">
                                    {q.options.map((opt, oi) => {
                                        const arr = Array.isArray(answers[q.id]) ? (answers[q.id] as unknown[]) : [];
                                        const checked = arr.includes(opt);
                                        return (
                                            <label key={oi} className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={(e) => {
                                                        const next = [...arr];
                                                        if (e.target.checked) next.push(opt);
                                                        else {
                                                            const i = next.indexOf(opt);
                                                            if (i >= 0) next.splice(i, 1);
                                                        }
                                                        setAnswer(q.id, next);
                                                    }}
                                                />
                                                <span>{String(opt)}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}

                            {q.question_type === 'text' && (
                                <textarea
                                    value={typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''}
                                    onChange={(e) => setAnswer(q.id, e.target.value)}
                                    rows={3}
                                    className="w-full border rounded px-3 py-2"
                                />
                            )}
                        </div>
                    ))}
                </div>

                <div className="flex justify-end mt-6">
                    <button
                        onClick={submit}
                        disabled={submitting}
                        className="px-6 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
                    >
                        {submitting ? 'Отправка...' : 'Завершить тест'}
                    </button>
                </div>
            </div>

            <ExternalProctoringPanel
                procState={procState}
                cameraStream={cameraStream}
                videoRef={videoRef}
                canvasRef={canvasRef}
            />
        </div>
    );
};

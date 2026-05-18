import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { externalTestsApi, type ExternalQuestion, type ExternalTest } from '../../shared/api/externalTests';
import { AdminHeader } from './AdminHeader';
import { AiGenerateModal } from './AiGenerateModal';

const emptyQuestion = (): ExternalQuestion => ({
    question_type: 'mcq',
    content: '',
    options: ['', '', '', ''],
    correct_answer: null,
    points: 1,
});

const questionTypeLabel: Record<string, string> = {
    mcq: 'Один вариант',
    multi: 'Несколько вариантов',
    text: 'Текстовый ответ',
};

export const ExternalTestEditorPage = () => {
    const location = useLocation();
    const segment = location.pathname.split('/').pop() || '';
    const id = /^\d+$/.test(segment) ? segment : undefined;
    const isEdit = !!id;
    const navigate = useNavigate();

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [attemptLimit, setAttemptLimit] = useState<number>(1);
    const [deadline, setDeadline] = useState<string>('');
    const [questions, setQuestions] = useState<ExternalQuestion[]>([emptyQuestion()]);
    const [isDraft, setIsDraft] = useState<boolean>(true);
    const [saving, setSaving] = useState<'draft' | 'publish' | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(isEdit);
    const [aiOpen, setAiOpen] = useState(false);

    useEffect(() => {
        if (isEdit && id) {
            (async () => {
                try {
                    const t = await externalTestsApi.get(id);
                    setTitle(t.title);
                    setDescription(t.description || '');
                    setAttemptLimit(t.default_attempt_limit);
                    setDeadline(t.default_deadline_at ? t.default_deadline_at.slice(0, 16) : '');
                    setQuestions(t.questions && t.questions.length > 0 ? t.questions : [emptyQuestion()]);
                    setIsDraft(t.is_draft ?? true);
                } catch (e: unknown) {
                    setError(e instanceof Error ? e.message : 'Не удалось загрузить тест');
                } finally {
                    setLoading(false);
                }
            })();
        }
    }, [id, isEdit]);

    const updateQuestion = (idx: number, patch: Partial<ExternalQuestion>) => {
        setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
    };

    const updateOption = (qIdx: number, optIdx: number, value: string) => {
        setQuestions((prev) =>
            prev.map((q, i) => {
                if (i !== qIdx) return q;
                const opts = [...(q.options || [])];
                opts[optIdx] = value;
                return { ...q, options: opts };
            }),
        );
    };

    const addOption = (qIdx: number) => {
        setQuestions((prev) =>
            prev.map((q, i) => (i === qIdx ? { ...q, options: [...(q.options || []), ''] } : q)),
        );
    };

    const removeOption = (qIdx: number, optIdx: number) => {
        setQuestions((prev) =>
            prev.map((q, i) => {
                if (i !== qIdx) return q;
                const opts = (q.options || []).filter((_, k) => k !== optIdx);
                return { ...q, options: opts };
            }),
        );
    };

    const addQuestion = () => setQuestions((prev) => [...prev, emptyQuestion()]);
    const removeQuestion = (idx: number) => setQuestions((prev) => prev.filter((_, i) => i !== idx));

    const remove = async () => {
        if (!isEdit || !id) return;
        if (!confirm(`Удалить тест «${title}»? Действие нельзя отменить — все попытки также будут удалены.`)) return;
        setDeleting(true);
        setError(null);
        try {
            await externalTestsApi.remove(id);
            navigate('/admin/external-tests');
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Не удалось удалить');
        } finally {
            setDeleting(false);
        }
    };

    const save = async (mode: 'draft' | 'publish') => {
        if (!title.trim()) {
            setError('Введите название теста');
            return;
        }
        setSaving(mode);
        setError(null);
        try {
            const payload: Omit<ExternalTest, 'id'> & { is_draft: boolean } = {
                title,
                description: description || null,
                default_attempt_limit: attemptLimit,
                default_deadline_at: deadline ? new Date(deadline).toISOString() : null,
                is_draft: mode === 'draft',
                questions: questions.map((q) => ({
                    question_type: q.question_type,
                    content: q.content,
                    options: q.question_type === 'text' ? null : q.options,
                    correct_answer: q.correct_answer,
                    points: q.points,
                })),
            };
            const result = isEdit && id ? await externalTestsApi.update(id, payload) : await externalTestsApi.create(payload);
            setIsDraft(result?.is_draft ?? (mode === 'draft'));

            const callback = sessionStorage.getItem('pk_callback_url');
            if (callback && result?.id !== undefined) {
                sessionStorage.removeItem('pk_callback_url');
                const sep = callback.includes('?') ? '&' : '?';
                window.location.href = `${callback}${sep}entest_test_id=${result.id}`;
                return;
            }
            navigate('/admin/external-tests');
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Не удалось сохранить');
        } finally {
            setSaving(null);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50">
                <AdminHeader />
                <div className="flex items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <AdminHeader />
            <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10">
                {/* header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                    <div>
                        <button
                            onClick={() => navigate('/admin/external-tests')}
                            className="text-blue-600 text-sm hover:text-blue-800 mb-2 inline-flex items-center gap-1"
                        >
                            ← К списку тестов
                        </button>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                                {isEdit ? 'Редактирование теста' : 'Новый тест'}
                            </h1>
                            <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                    isDraft
                                        ? 'bg-yellow-100 text-yellow-800'
                                        : 'bg-green-100 text-green-800'
                                }`}
                            >
                                {isDraft ? 'Черновик' : 'Опубликован'}
                            </span>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="mb-5 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                        {error}
                    </div>
                )}

                {/* main info card */}
                <div className="bg-white rounded-lg shadow-md p-5 md:p-6 mb-5">
                    <h2 className="text-base font-semibold text-gray-900 mb-4">Основная информация</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Название теста *</label>
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Например: Английский B1 — апрель"
                                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Описание</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={3}
                                placeholder="Опционально — что проверяет этот тест"
                                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Лимит попыток</label>
                                <input
                                    type="number"
                                    min={1}
                                    value={attemptLimit}
                                    onChange={(e) => setAttemptLimit(Number(e.target.value))}
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Дедлайн (опц.)</label>
                                <input
                                    type="datetime-local"
                                    value={deadline}
                                    onChange={(e) => setDeadline(e.target.value)}
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* questions */}
                <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                    <h2 className="text-base font-semibold text-gray-900">
                        Вопросы <span className="text-gray-500 font-normal">· {questions.length}</span>
                    </h2>
                    <button
                        onClick={() => setAiOpen(true)}
                        className="inline-flex items-center gap-2 rounded-md bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1.5 text-sm font-medium hover:bg-purple-100 transition"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2 L13.5 8.5 L20 10 L13.5 11.5 L12 18 L10.5 11.5 L4 10 L10.5 8.5 Z" />
                            <path d="M18 14 L18.7 16 L20.7 16.7 L18.7 17.4 L18 19.4 L17.3 17.4 L15.3 16.7 L17.3 16 Z" />
                        </svg>
                        Сгенерировать через AI
                    </button>
                </div>

                <div className="space-y-4 mb-4">
                    {questions.map((q, idx) => (
                        <div key={idx} className="bg-white rounded-lg shadow-md overflow-hidden">
                            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700">Вопрос {idx + 1}</span>
                                {questions.length > 1 && (
                                    <button
                                        onClick={() => removeQuestion(idx)}
                                        className="text-red-600 text-sm hover:text-red-800 font-medium"
                                    >
                                        Удалить
                                    </button>
                                )}
                            </div>
                            <div className="p-5 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Тип</label>
                                        <select
                                            value={q.question_type}
                                            onChange={(e) => updateQuestion(idx, { question_type: e.target.value })}
                                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        >
                                            {Object.entries(questionTypeLabel).map(([k, v]) => (
                                                <option key={k} value={k}>{v}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Баллы</label>
                                        <input
                                            type="number"
                                            min={0}
                                            step={0.5}
                                            value={q.points}
                                            onChange={(e) => updateQuestion(idx, { points: Number(e.target.value) })}
                                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Текст вопроса</label>
                                    <textarea
                                        value={q.content}
                                        onChange={(e) => updateQuestion(idx, { content: e.target.value })}
                                        rows={2}
                                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>

                                {q.question_type !== 'text' && (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-2">
                                            Варианты ответов
                                            <span className="text-gray-500 font-normal ml-1">
                                                {q.question_type === 'mcq' ? '(отметьте правильный)' : '(отметьте все правильные)'}
                                            </span>
                                        </label>
                                        <div className="space-y-2">
                                            {(q.options || []).map((opt, optIdx) => {
                                                const optTrimmed = (opt || '').trim();
                                                const isCorrect =
                                                    optTrimmed !== '' &&
                                                    (q.question_type === 'mcq'
                                                        ? q.correct_answer === opt
                                                        : Array.isArray(q.correct_answer) && (q.correct_answer as string[]).includes(opt));
                                                return (
                                                    <div
                                                        key={optIdx}
                                                        className={`flex items-center gap-2 rounded-md border px-3 py-2 transition ${
                                                            isCorrect
                                                                ? 'border-green-300 bg-green-50'
                                                                : 'border-gray-200 bg-white'
                                                        }`}
                                                    >
                                                        {q.question_type === 'mcq' ? (
                                                            <input
                                                                type="radio"
                                                                name={`correct-${idx}`}
                                                                checked={isCorrect}
                                                                onChange={() => updateQuestion(idx, { correct_answer: opt })}
                                                                className="w-4 h-4 accent-blue-600 shrink-0"
                                                            />
                                                        ) : (
                                                            <input
                                                                type="checkbox"
                                                                checked={isCorrect}
                                                                onChange={(e) => {
                                                                    const arr = Array.isArray(q.correct_answer) ? [...(q.correct_answer as string[])] : [];
                                                                    if (e.target.checked) arr.push(opt);
                                                                    else {
                                                                        const i = arr.indexOf(opt);
                                                                        if (i >= 0) arr.splice(i, 1);
                                                                    }
                                                                    updateQuestion(idx, { correct_answer: arr });
                                                                }}
                                                                className="w-4 h-4 accent-blue-600 shrink-0"
                                                            />
                                                        )}
                                                        <input
                                                            value={opt}
                                                            onChange={(e) => updateOption(idx, optIdx, e.target.value)}
                                                            className="flex-1 bg-transparent border-0 focus:outline-none text-sm text-gray-900 placeholder:text-gray-400"
                                                            placeholder={`Вариант ${optIdx + 1}`}
                                                        />
                                                        <button
                                                            onClick={() => removeOption(idx, optIdx)}
                                                            className="text-gray-400 hover:text-red-600 text-sm w-6 h-6 flex items-center justify-center"
                                                            title="Удалить вариант"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <button
                                            onClick={() => addOption(idx)}
                                            className="text-blue-600 text-sm mt-2 hover:text-blue-800 font-medium"
                                        >
                                            + Добавить вариант
                                        </button>
                                    </div>
                                )}

                                {q.question_type === 'text' && (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Правильный ответ (опц.)</label>
                                        <input
                                            value={typeof q.correct_answer === 'string' ? q.correct_answer : ''}
                                            onChange={(e) => updateQuestion(idx, { correct_answer: e.target.value })}
                                            placeholder="Если ответ свободный — оставьте пустым"
                                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <button
                    onClick={addQuestion}
                    className="w-full mb-6 rounded-lg border-2 border-dashed border-gray-300 bg-white py-4 text-blue-600 font-medium text-sm hover:bg-blue-50 hover:border-blue-300 transition"
                >
                    + Добавить вопрос
                </button>

                <AiGenerateModal
                    open={aiOpen}
                    onClose={() => setAiOpen(false)}
                    defaultTopic={title}
                    onGenerated={(qs, mode) => {
                        if (qs.length === 0) return;
                        setQuestions((prev) => {
                            if (mode === 'replace') return qs;
                            // Append, but if prev has only one empty placeholder, drop it.
                            const isEmptyPlaceholder = prev.length === 1 && !prev[0].content?.trim();
                            return isEmptyPlaceholder ? qs : [...prev, ...qs];
                        });
                    }}
                />

                {/* sticky footer */}
                <div className="sticky bottom-0 -mx-4 md:-mx-8 px-4 md:px-8 py-4 bg-white border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
                    <div className="max-w-4xl mx-auto flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
                        {isEdit ? (
                            <button
                                onClick={remove}
                                disabled={deleting || saving !== null}
                                className="px-4 py-2.5 rounded-md border border-red-200 text-red-600 bg-white text-sm font-medium hover:bg-red-50 transition disabled:opacity-50"
                            >
                                {deleting ? 'Удаляем...' : 'Удалить тест'}
                            </button>
                        ) : <span />}
                        <div className="flex flex-col-reverse sm:flex-row gap-2">
                            <button
                                onClick={() => save('draft')}
                                disabled={saving !== null || deleting}
                                className="px-5 py-2.5 rounded-md border border-gray-300 text-gray-700 bg-white text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50"
                            >
                                {saving === 'draft' ? 'Сохраняем...' : 'Сохранить черновик'}
                            </button>
                            <button
                                onClick={() => save('publish')}
                                disabled={saving !== null || deleting}
                                className="px-6 py-2.5 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50"
                            >
                                {saving === 'publish' ? 'Публикуем...' : 'Опубликовать'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

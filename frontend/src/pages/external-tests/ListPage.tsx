import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { externalTestsApi } from '../../shared/api/externalTests';
import { AdminHeader } from './AdminHeader';

type Summary = {
    id: number;
    title: string;
    description?: string | null;
    default_attempt_limit: number;
    default_deadline_at?: string | null;
    is_archived: boolean;
    is_draft: boolean;
    question_count: number;
    created_at?: string | null;
};

const formatDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');

export const ExternalTestsListPage = () => {
    const navigate = useNavigate();
    const [items, setItems] = useState<Summary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const load = async () => {
        try {
            const data = await externalTestsApi.list();
            setItems(Array.isArray(data) ? data : []);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Не удалось загрузить');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const remove = async (t: Summary) => {
        if (!confirm(`Удалить тест «${t.title}»? Действие нельзя отменить.`)) return;
        setDeletingId(t.id);
        setError(null);
        try {
            await externalTestsApi.remove(t.id);
            await load();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Не удалось удалить');
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <AdminHeader />
            <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Тесты</h1>
                        <p className="text-sm text-gray-500 mt-1">Тесты, созданные из приёмной комиссии</p>
                    </div>
                    <button
                        onClick={() => navigate('/admin/external-tests/new')}
                        className="self-start sm:self-auto px-5 py-2.5 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition"
                    >
                        + Создать тест
                    </button>
                </div>

                {error && (
                    <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm mb-4">{error}</div>
                )}

                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
                    </div>
                ) : items.length === 0 ? (
                    <div className="bg-white rounded-lg shadow-md p-12 text-center">
                        <div className="text-gray-900 font-medium mb-1">Тестов пока нет</div>
                        <div className="text-sm text-gray-500">Нажмите «Создать тест», чтобы начать.</div>
                    </div>
                ) : (
                    <div className="bg-white rounded-lg shadow-md overflow-hidden">
                        <ul className="divide-y divide-gray-200">
                            {items.map((t) => (
                                <li key={t.id} className="hover:bg-gray-50 transition">
                                    <div className="flex items-center gap-3 px-5 py-4">
                                        <button
                                            onClick={() => navigate(`/admin/external-tests/${t.id}`)}
                                            className="text-left min-w-0 flex-1 cursor-pointer"
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-medium text-gray-900 truncate">{t.title}</span>
                                                <span
                                                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                                        t.is_draft
                                                            ? 'bg-yellow-100 text-yellow-800'
                                                            : 'bg-green-100 text-green-800'
                                                    }`}
                                                >
                                                    {t.is_draft ? 'Черновик' : 'Опубликован'}
                                                </span>
                                            </div>
                                            <div className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
                                                <span>Вопросов: {t.question_count}</span>
                                                <span>Попыток: {t.default_attempt_limit}</span>
                                                <span>Создан: {formatDate(t.created_at)}</span>
                                            </div>
                                        </button>
                                        <button
                                            onClick={() => navigate(`/admin/external-tests/${t.id}`)}
                                            className="hidden sm:inline text-blue-600 text-sm font-medium shrink-0 hover:text-blue-800"
                                        >
                                            Редактировать
                                        </button>
                                        <button
                                            onClick={() => remove(t)}
                                            disabled={deletingId === t.id}
                                            title="Удалить"
                                            className="w-9 h-9 rounded-md border border-gray-200 text-gray-500 flex items-center justify-center hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition disabled:opacity-50"
                                        >
                                            {deletingId === t.id ? (
                                                <span className="text-xs">...</span>
                                            ) : (
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="3 6 5 6 21 6"></polyline>
                                                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                                                    <path d="M10 11v6"></path>
                                                    <path d="M14 11v6"></path>
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
};

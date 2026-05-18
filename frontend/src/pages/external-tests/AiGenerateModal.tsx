import { useState } from 'react';
import { externalTestsApi, type ExternalQuestion } from '../../shared/api/externalTests';

interface Props {
    open: boolean;
    onClose: () => void;
    onGenerated: (questions: ExternalQuestion[], mode: 'replace' | 'append') => void;
    defaultTopic?: string;
}

const TYPES = [
    { key: 'mcq', label: 'Один вариант' },
    { key: 'multi', label: 'Несколько вариантов' },
    { key: 'text', label: 'Текстовый ответ' },
];

const DIFFICULTIES = [
    { key: 'easy', label: 'Лёгкий' },
    { key: 'medium', label: 'Средний' },
    { key: 'hard', label: 'Сложный' },
];

const LANGUAGES = [
    { key: 'ru', label: 'Русский' },
    { key: 'en', label: 'English' },
    { key: 'kz', label: 'Қазақша' },
];

export const AiGenerateModal = ({ open, onClose, onGenerated, defaultTopic }: Props) => {
    const [topic, setTopic] = useState(defaultTopic || '');
    const [count, setCount] = useState(5);
    const [difficulty, setDifficulty] = useState('medium');
    const [language, setLanguage] = useState('ru');
    const [questionTypes, setQuestionTypes] = useState<string[]>(['mcq']);
    const [instructions, setInstructions] = useState('');
    const [mode, setMode] = useState<'replace' | 'append'>('append');
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!open) return null;

    const toggleType = (key: string) => {
        setQuestionTypes((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    };

    const submit = async () => {
        if (!topic.trim()) {
            setError('Укажите тему теста');
            return;
        }
        if (questionTypes.length === 0) {
            setError('Выберите хотя бы один тип вопросов');
            return;
        }
        setGenerating(true);
        setError(null);
        try {
            const result = await externalTestsApi.generateQuestions({
                topic,
                count,
                difficulty,
                language,
                question_types: questionTypes,
                instructions: instructions || undefined,
            });
            onGenerated(result.questions, mode);
            onClose();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Не удалось сгенерировать');
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white w-full sm:max-w-xl sm:rounded-lg rounded-t-lg shadow-xl flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">Сгенерировать вопросы через AI</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
                </div>

                <div className="px-5 py-4 overflow-y-auto flex-1">
                    {error && (
                        <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Тема <span className="text-red-500">*</span>
                            </label>
                            <input
                                value={topic}
                                onChange={(e) => setTopic(e.target.value)}
                                placeholder="Например: Алгебра 10 класс, квадратные уравнения"
                                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Количество</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={30}
                                    value={count}
                                    onChange={(e) => setCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Сложность</label>
                                <select
                                    value={difficulty}
                                    onChange={(e) => setDifficulty(e.target.value)}
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    {DIFFICULTIES.map((d) => (
                                        <option key={d.key} value={d.key}>{d.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="col-span-2 sm:col-span-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Язык</label>
                                <select
                                    value={language}
                                    onChange={(e) => setLanguage(e.target.value)}
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    {LANGUAGES.map((l) => (
                                        <option key={l.key} value={l.key}>{l.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Типы вопросов</label>
                            <div className="flex flex-wrap gap-2">
                                {TYPES.map((t) => {
                                    const active = questionTypes.includes(t.key);
                                    return (
                                        <button
                                            key={t.key}
                                            onClick={() => toggleType(t.key)}
                                            className={`rounded-full px-3 py-1.5 text-sm font-medium border transition ${
                                                active
                                                    ? 'bg-blue-600 text-white border-blue-600'
                                                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                                            }`}
                                        >
                                            {t.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Доп. инструкции <span className="text-gray-400 font-normal">(опц.)</span>
                            </label>
                            <textarea
                                value={instructions}
                                onChange={(e) => setInstructions(e.target.value)}
                                placeholder="Например: фокус на практических задачах, избегать формул"
                                rows={3}
                                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Что сделать с текущими вопросами</label>
                            <div className="flex gap-3">
                                <label className="flex items-center gap-2 cursor-pointer text-sm">
                                    <input
                                        type="radio"
                                        checked={mode === 'append'}
                                        onChange={() => setMode('append')}
                                        className="accent-blue-600"
                                    />
                                    Добавить к существующим
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer text-sm">
                                    <input
                                        type="radio"
                                        checked={mode === 'replace'}
                                        onChange={() => setMode('replace')}
                                        className="accent-blue-600"
                                    />
                                    Заменить
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 px-5 py-4 border-t border-gray-200">
                    <button
                        onClick={onClose}
                        disabled={generating}
                        className="px-5 py-2.5 rounded-md border border-gray-300 text-gray-700 bg-white text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50"
                    >
                        Отмена
                    </button>
                    <button
                        onClick={submit}
                        disabled={generating}
                        className="px-6 py-2.5 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50 inline-flex items-center gap-2"
                    >
                        {generating && (
                            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        )}
                        {generating ? 'Генерирую...' : 'Сгенерировать'}
                    </button>
                </div>
            </div>
        </div>
    );
};

import { auth } from './api';

const API_BASE = '/api/v1';

const request = async (method: string, path: string, body?: unknown) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const authHeader = auth.getAuthHeader();
    if (authHeader) headers['Authorization'] = authHeader;

    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const data = text ? safeJsonParse(text) : null;
    if (!res.ok) {
        const err = new Error(data?.detail || res.statusText) as Error & { status?: number; data?: unknown };
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return data;
};

const safeJsonParse = (s: string) => {
    try {
        return JSON.parse(s);
    } catch {
        return null;
    }
};

export type ExternalQuestion = {
    id?: number;
    test_id?: number;
    order_number?: number;
    question_type: 'mcq' | 'multi' | 'text' | string;
    content: string;
    options?: string[] | null;
    correct_answer?: unknown;
    points: number;
};

export type ExternalTest = {
    id?: number;
    title: string;
    description?: string | null;
    default_attempt_limit: number;
    default_deadline_at?: string | null;
    is_archived?: boolean;
    is_draft?: boolean;
    source?: string;
    external_owner_id?: string | null;
    questions?: ExternalQuestion[];
};

export type AttemptStart = {
    attempt_id: number;
    test_id: number;
    title: string;
    description?: string | null;
    status: string;
    questions: Array<{
        id: number;
        order_number: number;
        question_type: string;
        content: string;
        options?: unknown[] | null;
        points: number;
    }>;
};

export const externalTestsApi = {
    list: () => request('GET', '/integrations/pk/tests'),
    get: (id: number | string): Promise<ExternalTest> => request('GET', `/integrations/pk/tests/${id}`),
    create: (payload: Omit<ExternalTest, 'id'>): Promise<ExternalTest> =>
        request('POST', '/integrations/pk/tests', payload),
    update: (id: number | string, payload: Partial<ExternalTest>): Promise<ExternalTest> =>
        request('PATCH', `/integrations/pk/tests/${id}`, payload),
    archive: (id: number | string) => request('POST', `/integrations/pk/tests/${id}/archive`),
    remove: (id: number | string) => request('DELETE', `/integrations/pk/tests/${id}`),
    ssoExchange: (token: string): Promise<{ access_token: string; token_type: string; email: string }> =>
        request('POST', '/integrations/pk/sso/admin/exchange', { token }),
    generateQuestions: (payload: {
        topic: string;
        count: number;
        difficulty: string;
        language: string;
        question_types: string[];
        instructions?: string;
    }): Promise<{ questions: ExternalQuestion[] }> =>
        request('POST', '/integrations/pk/tests/generate-questions', payload),
};

export const externalAttemptsApi = {
    start: async (token: string): Promise<AttemptStart> => {
        const res = await fetch(`${API_BASE}/external-attempts/start?token=${encodeURIComponent(token)}`);
        const text = await res.text();
        const data = text ? safeJsonParse(text) : null;
        if (!res.ok) {
            const err = new Error(data?.detail || res.statusText) as Error & { status?: number };
            err.status = res.status;
            throw err;
        }
        return data;
    },
    submit: async (token: string, answers: Array<{ question_id: number; answer: unknown }>) => {
        const res = await fetch(`${API_BASE}/external-attempts/submit?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers }),
        });
        const text = await res.text();
        const data = text ? safeJsonParse(text) : null;
        if (!res.ok) {
            const err = new Error(data?.detail || res.statusText) as Error & { status?: number };
            err.status = res.status;
            throw err;
        }
        return data as { attempt_id: number; status: string; score: number };
    },
    savePhoto: async (token: string, dataUrl: string) => {
        const res = await fetch(`${API_BASE}/external-attempts/proctoring/photo?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photo: dataUrl }),
        });
        if (!res.ok) throw new Error(`Photo save failed: ${res.status}`);
    },
    logProctoringEvent: async (token: string, ev: { event_type: string; severity?: string; description?: string; metadata?: unknown }) => {
        try {
            await fetch(`${API_BASE}/external-attempts/proctoring/event?token=${encodeURIComponent(token)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...ev, recorded_at: new Date().toISOString() }),
                keepalive: true,
            });
        } catch (_) {
            // best-effort; don't break the test on logging failures
        }
    },
    logViolation: async (token: string, v: { violation_type: string; severity?: string; description?: string; violation_metadata?: unknown }) => {
        try {
            await fetch(`${API_BASE}/external-attempts/proctoring/violation?token=${encodeURIComponent(token)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(v),
                keepalive: true,
            });
        } catch (_) {
            // best-effort
        }
    },
    uploadScreenChunk: async (token: string, blob: Blob, chunkIndex: number, isFinal: boolean) => {
        const form = new FormData();
        form.append('chunk', blob, `chunk_${chunkIndex}.webm`);
        form.append('chunk_index', String(chunkIndex));
        form.append('is_final', String(isFinal));
        const res = await fetch(`${API_BASE}/external-attempts/screen-chunk?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            body: form,
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.detail || `Upload failed: ${res.status}`);
        }
        return res.json();
    },
};

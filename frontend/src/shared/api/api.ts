const getApiBaseUrl = () => {
    return '/api/v1';
};
const API_BASE_URL = getApiBaseUrl();
const auth = {
    getToken(): string | null {
        return localStorage.getItem('access_token');
    },
    getRefreshToken(): string | null {
        return localStorage.getItem('refresh_token');
    },
    getAuthHeader(): string | null {
        const token = this.getToken();
        const tokenType = localStorage.getItem('token_type') || 'Bearer';
        return token ? `${tokenType} ${token}` : null;
    },
    setTokens(accessToken: string, refreshToken: string, tokenType: string = 'Bearer'): void {
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('token_type', tokenType);
        localStorage.setItem('refresh_token', refreshToken);
    },
    clearTokens(): void {
        localStorage.removeItem('access_token');
        localStorage.removeItem('token_type');
        localStorage.removeItem('refresh_token');
    },
    isAuthenticated(): boolean {
        return !!this.getToken();
    }
};
let isRefreshing = false;
let failedQueue: {
    resolve: (value: unknown) => void;
    reject: (reason?: any) => void;
}[] = [];
const processQueue = (error: any | null = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        }
        else {
            prom.resolve(true);
        }
    });
    failedQueue = [];
};
async function apiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${getApiBaseUrl()}${endpoint}`;
    let authHeader = auth.getAuthHeader();
    const defaultHeaders: HeadersInit = {};
    if (!(options.body instanceof FormData)) {
        defaultHeaders['Content-Type'] = 'application/json';
    }
    if (authHeader) {
        defaultHeaders['Authorization'] = authHeader;
    }
    let config: RequestInit = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers,
        },
    };
    try {
        let response = await fetch(url, config);
        if (response.status === 401 &&
            endpoint !== '/auth/token' &&
            endpoint !== '/auth/register' &&
            endpoint !== '/auth/refresh-token' &&
            !endpoint.startsWith('/health/')) {
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then(() => {
                    config.headers = { ...config.headers, 'Authorization': auth.getAuthHeader() as string };
                    return fetch(url, config).then(res => {
                        if (!res.ok)
                            throw new Error(res.statusText);
                        return res;
                    });
                });
            }
            isRefreshing = true;
            const refreshToken = auth.getRefreshToken();
            if (!refreshToken) {
                auth.clearTokens();
                processQueue(new Error('No refresh token available'));
                window.location.href = '/login';
                throw new Error('No refresh token available');
            }
            try {
                const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh-token`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${refreshToken}`
                    }
                });
                if (!refreshResponse.ok) {
                    const errorData = await refreshResponse.json().catch(() => ({}));
                    console.error("Refresh token failed:", errorData);
                    auth.clearTokens();
                    processQueue(new Error(errorData.detail || 'Refresh token failed'));
                    window.location.href = '/login';
                    throw new Error('Refresh token failed');
                }
                const newTokenData = await refreshResponse.json();
                auth.setTokens(newTokenData.access_token, newTokenData.refresh_token, newTokenData.token_type);
                isRefreshing = false;
                processQueue();
                config.headers = { ...config.headers, 'Authorization': auth.getAuthHeader() as string };
                response = await fetch(url, config);
            }
            catch (refreshError) {
                console.error('Error refreshing token:', refreshError);
                auth.clearTokens();
                processQueue(refreshError);
                window.location.href = '/login';
                throw refreshError;
            }
        }
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("API error response data:", errorData);
            const error = new Error(errorData.detail || `HTTP error! status: ${response.status}`) as any;
            error.status = response.status;
            throw error;
        }
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            return await response.json();
        }
        return response.text();
    }
    catch (error) {
        console.error('API request failed:', error);
        throw error;
    }
}
async function getFile(endpoint: string): Promise<Blob> {
    const url = `${getApiBaseUrl()}${endpoint}`;
    const authHeader = auth.getAuthHeader();
    const headers: HeadersInit = {};
    if (authHeader) {
        headers['Authorization'] = authHeader;
    }
    const response = await fetch(url, {
        method: 'GET',
        headers: headers,
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }
    return await response.blob();
}
async function uploadFile(endpoint: string, file: Blob, filename: string, onProgress?: (progress: number) => void): Promise<any> {
    const url = `${getApiBaseUrl()}${endpoint}`;
    const authHeader = auth.getAuthHeader();
    const formData = new FormData();
    if (endpoint.includes('upload-screen') || endpoint.includes('append-screen')) {
        formData.append('video', file, filename);
    }
    else if (endpoint.includes('upload-initial-photo')) {
        formData.append('photo', file, filename);
    }
    else {
        formData.append('file', file, filename);
    }
    const headers: Record<string, string> = {};
    if (typeof authHeader === 'string' && authHeader) {
        headers['Authorization'] = authHeader;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, 600000);
    try {
        if (onProgress && file.size > 10 * 1024 * 1024) {
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable) {
                        const progress = Math.round((event.loaded / event.total) * 100);
                        onProgress(progress);
                    }
                });
                xhr.addEventListener('load', () => {
                    clearTimeout(timeoutId);
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            resolve(JSON.parse(xhr.responseText));
                        }
                        catch {
                            resolve({ success: true });
                        }
                    }
                    else {
                        let errorData;
                        try {
                            errorData = JSON.parse(xhr.responseText);
                        }
                        catch {
                            errorData = {};
                        }
                        if (xhr.status === 503) {
                            reject(new Error('Server is temporarily unavailable. Please try again later.'));
                        }
                        else if (xhr.status === 413) {
                            reject(new Error('File is too large. Please try with a smaller file.'));
                        }
                        else {
                            reject(new Error(errorData.detail || `File upload failed: ${xhr.statusText}`));
                        }
                    }
                });
                xhr.addEventListener('error', () => {
                    clearTimeout(timeoutId);
                    reject(new Error('Network error during upload'));
                });
                xhr.addEventListener('timeout', () => {
                    clearTimeout(timeoutId);
                    reject(new Error('Upload timed out. Please check your connection and try again.'));
                });
                xhr.open('POST', url);
                if (typeof authHeader === 'string' && authHeader) {
                    xhr.setRequestHeader('Authorization', authHeader);
                }
                xhr.timeout = 600000;
                xhr.send(formData);
                controller.signal.addEventListener('abort', () => {
                    xhr.abort();
                });
            });
        }
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: formData,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('API error response data:', errorData);
            if (response.status === 503) {
                throw new Error('Server is temporarily unavailable. Please try again later.');
            }
            else if (response.status === 413) {
                throw new Error('File is too large. Please try with a smaller file.');
            }
            else {
                throw new Error(errorData.detail || `File upload failed: ${response.statusText}`);
            }
        }
        return await response.json();
    }
    catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Upload timed out. Please check your connection and try again.');
        }
        throw error;
    }
}
const authApi = {
    async login(email: string, password: string) {
        const response = await fetch(`${API_BASE_URL}/auth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                username: email,
                password: password,
            }).toString(),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Login failed');
        }
        const tokenData = await response.json();
        auth.setTokens(tokenData.access_token, tokenData.refresh_token, tokenData.token_type);
        return tokenData;
    },
    async register(fullName: string, email: string, password: string) {
        return await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify({
                full_name: fullName,
                email: email,
                password: password,
            }),
        });
    },
};
const userApi = {
    async getMe() {
        const response = await apiRequest('/users/me');
        return response;
    },
};
const preliminaryTestApi = {
    async checkAttempts() {
        return await apiRequest('/preliminary-tests/attempts/check');
    },
    async startPreliminaryTest() {
        return await apiRequest('/preliminary-tests/start', {
            method: 'POST',
        });
    },
    async generateLevelTest(sessionId: number, level: string) {
        return await apiRequest(`/preliminary-tests/${sessionId}/generate/${level}`, {
            method: 'POST',
        });
    },
    async getQuestions(sessionId: number) {
        return await apiRequest(`/preliminary-tests/${sessionId}/questions`);
    },
    async submitAnswer(sessionId: number, questionId: number, answer: string) {
        return await apiRequest(`/preliminary-tests/${sessionId}/submit`, {
            method: 'POST',
            body: JSON.stringify({
                question_id: questionId,
                answer: answer
            }),
        });
    },
    async completeTest(sessionId: number) {
        return await apiRequest(`/preliminary-tests/${sessionId}/complete`, {
            method: 'POST',
        });
    },
    async getStatus(sessionId: number) {
        return await apiRequest(`/preliminary-tests/${sessionId}/status`);
    },
    async annulTest(sessionId: number) {
        return await apiRequest(`/preliminary-tests/${sessionId}/annul`, {
            method: 'POST',
        });
    },
    async createMainTest(sessionId: number) {
        return await apiRequest(`/preliminary-tests/${sessionId}/create-main-test`, {
            method: 'POST',
        });
    }
};
const testApi = {
    async checkAttempts() {
        return await apiRequest('/main-tests/attempts/check');
    },
    async startTest() {
        return await apiRequest('/main-tests/start', {
            method: 'POST',
        });
    },
    async getUserSessions() {
        return await apiRequest('/main-tests/sessions');
    },
    async getSession(sessionId: string) {
        return await apiRequest(`/main-tests/${sessionId}`);
    },
    async generateFullTest(sessionId: string, level: string = 'B1') {
        return await apiRequest(`/main-tests/${sessionId}/generate-full-test`, {
            method: 'POST',
            body: JSON.stringify({ level }),
        });
    },
    async getGenerationStatus(sessionId: string) {
        return await apiRequest(`/main-tests/${sessionId}/generation-status`);
    },
    async getQuestionsByType(sessionId: string, questionType: string) {
        return await apiRequest(`/main-tests/${sessionId}/questions/${questionType}`);
    },
    async submitReadingAnswer(sessionId: string, questionId: number, answer: string) {
        return await apiRequest(`/main-tests/${sessionId}/submit/reading`, {
            method: 'POST',
            body: JSON.stringify({
                question_id: questionId,
                answer: answer
            }),
        });
    },
    async submitListeningAnswer(sessionId: string, questionId: number, answer: string) {
        return await apiRequest(`/main-tests/${sessionId}/submit/listening`, {
            method: 'POST',
            body: JSON.stringify({
                question_id: questionId,
                answer: answer
            }),
        });
    },
    async saveWritingDraft(sessionId: string, questionId: number, answer: string) {
        return await apiRequest(`/main-tests/${sessionId}/save/writing`, {
            method: 'POST',
            body: JSON.stringify({
                question_id: questionId,
                answer: answer
            }),
        });
    },
    async submitWritingAnswer(sessionId: string, questionId: number, answer: string, level: string = 'B1') {
        return await apiRequest(`/main-tests/${sessionId}/submit/writing`, {
            method: 'POST',
            body: JSON.stringify({
                question_id: questionId,
                answer: answer,
                level: level
            }),
        });
    },
    async submitSpeakingAnswer(sessionId: string, questionId: number, formData: FormData) {
        return await apiRequest(`/main-tests/${sessionId}/submit/speaking/${questionId}`, {
            method: 'POST',
            body: formData,
        });
    },
    async getAudioFile(sessionId: string, filename: string): Promise<Blob> {
        return await getFile(`/main-tests/${sessionId}/audio/${filename}`);
    },
    async uploadScreenChunk(sessionId: string, chunk: Blob, chunkIndex: number, isFinal: boolean) {
        const formData = new FormData();
        formData.append('chunk', chunk, `chunk_${chunkIndex}.webm`);
        formData.append('chunk_index', chunkIndex.toString());
        formData.append('is_final', isFinal.toString());
        return await apiRequest(`/upload/screen-chunk/${sessionId}`, {
            method: 'POST',
            body: formData,
        });
    },
    async getUploadStatus(sessionId: string) {
        return await apiRequest(`/upload/status/${sessionId}`);
    },
    async getTestResults(sessionId: string) {
        return await apiRequest(`/main-tests/${sessionId}/results`);
    },
    async completeTest(sessionId: string) {
        return await apiRequest(`/main-tests/${sessionId}/complete`, {
            method: 'POST',
        });
    },
    async annulTest(sessionId: string) {
        return await apiRequest(`/main-tests/${sessionId}/annul`, {
            method: 'POST',
        });
    }
};
const proctoringApi = {
    async logEvent(logEntry: {
        session_id: string;
        violation_type: string;
        severity: string;
        description: string;
        violation_metadata: object;
    }) {
        return await apiRequest('/proctoring/log-violation', {
            method: 'POST',
            body: JSON.stringify(logEntry),
        });
    }
};
const adminApi = {
    getAuthHeader: auth.getAuthHeader,
    getAccessToken: auth.getToken,
    async getAllUsers() {
        return await apiRequest('/admin/users');
    },
    async getUserWithAttempts(userId: number) {
        return await apiRequest(`/admin/users/${userId}/attempts`);
    },
    async getAttemptDetails(attemptId: string) {
        return await apiRequest(`/admin/attempts/${attemptId}`);
    },
    async invalidateAttempt(attemptId: string, reason: string) {
        return await apiRequest(`/admin/attempts/${attemptId}/invalidate`, {
            method: 'POST',
            body: JSON.stringify({ reason }),
        });
    },
    async validateAttempt(attemptId: string) {
        return await apiRequest(`/admin/attempts/${attemptId}/validate`, {
            method: 'POST',
        });
    },
    async getUserAttemptsInfo(userId: number) {
        return await apiRequest(`/admin/users/${userId}/attempts-info`);
    },
    async resetUserAttempts(userId: number, reason: string) {
        return await apiRequest(`/admin/users/${userId}/reset-attempts`, {
            method: 'POST',
            body: JSON.stringify({ user_id: userId, reason }),
        });
    }
};
const completeTestResultsApi = {
    async getCompleteTestResults(testId: string) {
        return await apiRequest(`/results/complete/${testId}`);
    }
};
const testResultsApi = {
    async getTestResult(resultId: number) {
        return await apiRequest(`/results/${resultId}`);
    },
    async getTestProgress(resultId: number) {
        return await apiRequest(`/results/${resultId}/progress`);
    },
    async getUserTestResults() {
        return await apiRequest('/results/user/all');
    },
    async invalidateTestResult(resultId: number, reason: string) {
        return await apiRequest(`/results/${resultId}/invalidate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason })
        });
    }
};
const monitoringApi = {
    async getSystemHealth() {
        try {
            const response = await apiRequest('/health/system-health');
            if (!response || typeof response !== 'object') {
                throw new Error('Invalid response format');
            }
            return {
                overall_status: response.overall_status || 'unknown',
                alerts: Array.isArray(response.alerts) ? response.alerts : [],
                performance: response.performance || {},
                services: response.services || {},
                timestamp: response.timestamp || Date.now()
            };
        }
        catch (error: any) {
            if (error?.status === 401 || error?.status === 403) {
                throw error;
            }
            console.warn('System health API error:', error);
            return {
                overall_status: 'unknown',
                alerts: [],
                performance: {},
                services: {},
                timestamp: Date.now()
            };
        }
    },
    async getPerformanceMetrics() {
        return await apiRequest('/health/performance-metrics');
    },
    async getCacheStats() {
        return await apiRequest('/health/cache-stats');
    },
    async getActiveTasks() {
        return await apiRequest('/health/active-tasks');
    },
    async clearCache(pattern: string = '*') {
        return await apiRequest('/health/clear-cache', {
            method: 'POST',
            body: JSON.stringify({ pattern }),
        });
    },
    async optimizeSystem() {
        return await apiRequest('/health/optimize-system', {
            method: 'POST',
        });
    }
};
const uploadApi = {
    async uploadScreenChunk(sessionId: string, chunk: Blob, chunkIndex: number, isFinal: boolean) {
        const formData = new FormData();
        formData.append('chunk', chunk, `chunk_${chunkIndex}.webm`);
        formData.append('chunk_index', chunkIndex.toString());
        formData.append('is_final', isFinal.toString());
        return await apiRequest(`/upload/screen-chunk/${sessionId}`, {
            method: 'POST',
            body: formData,
        });
    },
    async getUploadStatus(sessionId: string) {
        return await apiRequest(`/upload/status/${sessionId}`);
    },
    connectStatusWebSocket(sessionId: string, onMessage: (data: any) => void) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const wsUrl = `${protocol}//${window.location.host}/api/v1/upload/ws/status/${sessionId}`;
                const ws = new WebSocket(wsUrl);
                ws.onmessage = (event) => {
                        try {
                                const data = JSON.parse(event.data);
                                onMessage(data);
                        }
                        catch (error) {
                                console.error('Error parsing WebSocket message:', error);
                        }
                };
                ws.onerror = (error) => {
                        console.error('WebSocket error:', error);
                };
                const pingInterval = setInterval(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                                ws.send('ping');
                        }
                        else {
                                clearInterval(pingInterval);
                        }
                }, 30000);
                return ws;
        }
};
const completeTestApi = testApi;
const resultsApi = testResultsApi;
export {
        auth,
        authApi,
        userApi,
        testApi,
        preliminaryTestApi,
        proctoringApi,
        adminApi,
        completeTestResultsApi,
        testResultsApi,
        monitoringApi,
        uploadApi,
        completeTestApi,
        resultsApi,
        getFile,
        uploadFile,
        getApiBaseUrl
};

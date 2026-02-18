const CACHE_NAME = 'upload-cache-v1';
const UPLOAD_STORE = 'upload-store';
self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    self.skipWaiting();
});
self.addEventListener('activate', (event) => {
    console.log('Service Worker activating...');
    event.waitUntil(self.clients.claim());
});
self.addEventListener('sync', (event) => {
    if (event.tag === 'background-upload') {
        console.log('Background sync triggered for uploads');
        event.waitUntil(processUploadQueue());
    }
});
self.addEventListener('message', (event) => {
    const { type, data } = event.data;
    switch (type) {
        case 'QUEUE_UPLOAD':
            queueUpload(data);
            break;
        case 'GET_QUEUE_STATUS':
            event.ports[0].postMessage({
                type: 'QUEUE_STATUS',
                data: getQueueStatus()
            });
            break;
    }
});
async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(UPLOAD_STORE, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('uploads')) {
                const store = db.createObjectStore('uploads', { keyPath: 'id' });
                store.createIndex('priority', 'priority', { unique: false });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
    });
}
async function queueUpload(uploadData) {
    try {
        const db = await openDB();
        const transaction = db.transaction(['uploads'], 'readwrite');
        const store = transaction.objectStore('uploads');
        const uploadRecord = {
            id: uploadData.id,
            sessionId: uploadData.sessionId,
            endpoint: uploadData.endpoint,
            filename: uploadData.filename,
            priority: uploadData.priority,
            blob: uploadData.blob,
            timestamp: Date.now(),
            retryCount: 0
        };
        await store.add(uploadRecord);
        console.log('Upload queued in IndexedDB:', uploadData.id);
        if (self.registration && self.registration.sync) {
            await self.registration.sync.register('background-upload');
        }
    }
    catch (error) {
        console.error('Failed to queue upload:', error);
    }
}
async function processUploadQueue() {
    try {
        const db = await openDB();
        const transaction = db.transaction(['uploads'], 'readwrite');
        const store = transaction.objectStore('uploads');
        const index = store.index('priority');
        const uploads = await getAllFromIndex(index);
        for (const upload of uploads) {
            try {
                await processUpload(upload);
                await store.delete(upload.id);
                console.log('Upload completed and removed from queue:', upload.id);
            }
            catch (error) {
                console.error('Upload failed:', upload.id, error);
                upload.retryCount = (upload.retryCount || 0) + 1;
                if (upload.retryCount < 3) {
                    await store.put(upload);
                }
                else {
                    await store.delete(upload.id);
                    console.log('Upload permanently failed and removed:', upload.id);
                }
            }
        }
    }
    catch (error) {
        console.error('Failed to process upload queue:', error);
    }
}
async function processUpload(upload) {
    const url = `${getApiBaseUrl()}/main-tests/${upload.sessionId}${upload.endpoint}`;
    const formData = new FormData();
    formData.append('video', upload.blob, upload.filename);
    const response = await fetch(url, {
        method: 'POST',
        body: formData,
        headers: {}
    });
    if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }
    return response.json();
}
async function getAllFromIndex(index) {
    return new Promise((resolve, reject) => {
        const request = index.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}
function getApiBaseUrl() {
    return 'https://entest.almv.kz/api/v1';
}
async function getQueueStatus() {
    try {
        const db = await openDB();
        const transaction = db.transaction(['uploads'], 'readonly');
        const store = transaction.objectStore('uploads');
        const uploads = await getAllFromIndex(store);
        return {
            count: uploads.length,
            items: uploads.map(upload => ({
                id: upload.id,
                filename: upload.filename,
                priority: upload.priority,
                size: upload.blob.size,
                retryCount: upload.retryCount || 0,
                timestamp: upload.timestamp
            }))
        };
    }
    catch (error) {
        console.error('Failed to get queue status:', error);
        return { count: 0, items: [] };
    }
}

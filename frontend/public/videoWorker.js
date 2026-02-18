self.onmessage = async function (e) {
    const { type, data } = e.data;
    switch (type) {
        case 'COMPRESS_VIDEO':
            await compressVideo(data);
            break;
        case 'CREATE_CHUNKS':
            await createChunks(data);
            break;
        default:
            self.postMessage({ type: 'ERROR', error: 'Unknown message type' });
    }
};
async function compressVideo({ blob, quality = 0.8 }) {
    try {
        self.postMessage({ type: 'PROGRESS', progress: 0, message: 'Starting compression...' });
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const videoUrl = URL.createObjectURL(blob);
        video.src = videoUrl;
        await new Promise((resolve, reject) => {
            video.onloadedmetadata = resolve;
            video.onerror = reject;
        });
        const scale = quality;
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;
        self.postMessage({
            type: 'PROGRESS',
            progress: 50,
            message: 'Processing video frames...'
        });
        const stream = canvas.captureStream(30);
        const mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'video/webm;codecs=vp8',
            videoBitsPerSecond: 500000
        });
        const chunks = [];
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                chunks.push(event.data);
            }
        };
        mediaRecorder.onstop = () => {
            const compressedBlob = new Blob(chunks, { type: 'video/webm' });
            self.postMessage({
                type: 'COMPRESSION_COMPLETE',
                compressedBlob,
                originalSize: blob.size,
                compressedSize: compressedBlob.size,
                compressionRatio: (1 - compressedBlob.size / blob.size) * 100
            });
            URL.revokeObjectURL(videoUrl);
        };
        mediaRecorder.start();
        video.play();
        const drawFrame = () => {
            if (!video.paused && !video.ended) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                requestAnimationFrame(drawFrame);
            }
            else {
                mediaRecorder.stop();
            }
        };
        drawFrame();
    }
    catch (error) {
        self.postMessage({ type: 'ERROR', error: error.message });
    }
}
async function createChunks({ blob, chunkSize = 5 * 1024 * 1024 }) {
    try {
        self.postMessage({ type: 'PROGRESS', progress: 0, message: 'Creating chunks...' });
        const chunks = [];
        const totalChunks = Math.ceil(blob.size / chunkSize);
        for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, blob.size);
            const chunk = blob.slice(start, end);
            chunks.push({
                data: chunk,
                index: i,
                size: chunk.size
            });
            const progress = Math.round(((i + 1) / totalChunks) * 100);
            self.postMessage({
                type: 'PROGRESS',
                progress,
                message: `Created chunk ${i + 1}/${totalChunks}`
            });
        }
        self.postMessage({
            type: 'CHUNKS_CREATED',
            chunks,
            totalChunks,
            totalSize: blob.size
        });
    }
    catch (error) {
        self.postMessage({ type: 'ERROR', error: error.message });
    }
}

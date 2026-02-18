import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@shared': path.resolve(__dirname, './src/shared'),
            '@features': path.resolve(__dirname, './src/features'),
            '@widgets': path.resolve(__dirname, './src/widgets'),
            '@app': path.resolve(__dirname, './src/app'),
        },
    },
    server: {
        host: true,
        proxy: {
            '/api': {
                // In Docker use backend-1; on host use localhost:8000
                target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8000',
                changeOrigin: true,
                secure: false,
            },
        },
    },
});

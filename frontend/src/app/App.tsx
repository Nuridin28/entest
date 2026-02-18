import { useEffect } from 'react';
import { AuthProvider, ToastProvider } from './providers';
import { AppRouter } from './router';
import { SystemStatusBanner } from '../features/monitoring';
import { ErrorBoundary } from '../shared/components';
import { useAuth } from './providers';
import { BrowserRouter } from 'react-router-dom';
function AppContent() {
    const { isAdmin, isLoading } = useAuth();
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                console.log('Service Worker registered successfully:', registration);
            })
                .catch(error => {
                console.log('Service Worker registration failed:', error);
            });
        }
    }, []);
    if (isLoading) {
        return (<div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>);
    }
    return (<div>
      {isAdmin && (<ErrorBoundary fallback={null}>
          <SystemStatusBanner />
        </ErrorBoundary>)}
      <AppRouter />
    </div>);
}
function App() {
    return (<ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>);
}
export default App;

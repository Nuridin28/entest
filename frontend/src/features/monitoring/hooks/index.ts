import { useState, useEffect, useCallback } from 'react';
import type { SystemStatus, HealthCheck } from '../types';
export function useSystemStatus() {
    const [status, setStatus] = useState<SystemStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const fetchStatus = useCallback(async () => {
        try {
            const data = {
                status: 'healthy' as const,
                timestamp: new Date().toISOString()
            };
            setStatus(data);
        }
        catch (error) {
            console.error('Failed to fetch system status:', error);
            setStatus({
                status: 'error',
                message: 'Failed to fetch system status',
                timestamp: new Date().toISOString()
            });
        }
        finally {
            setIsLoading(false);
        }
    }, []);
    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 60000);
        return () => clearInterval(interval);
    }, [fetchStatus]);
    return { status, isLoading, refetch: fetchStatus };
}
export function useHealthCheck() {
    const [healthCheck, setHealthCheck] = useState<HealthCheck | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const fetchHealthCheck = useCallback(async () => {
        try {
            const data = {
                database: true,
                redis: true,
                external_services: true,
                overall_status: 'healthy' as const
            };
            setHealthCheck(data);
        }
        catch (error) {
            console.error('Failed to fetch health check:', error);
        }
        finally {
            setIsLoading(false);
        }
    }, []);
    useEffect(() => {
        fetchHealthCheck();
        const interval = setInterval(fetchHealthCheck, 30000);
        return () => clearInterval(interval);
    }, [fetchHealthCheck]);
    return { healthCheck, isLoading, refetch: fetchHealthCheck };
}

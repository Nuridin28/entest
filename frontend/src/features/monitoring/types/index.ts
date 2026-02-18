export interface SystemStatus {
    status: 'healthy' | 'warning' | 'error';
    message?: string;
    timestamp: string;
}
export interface HealthCheck {
    database: boolean;
    redis: boolean;
    external_services: boolean;
    overall_status: 'healthy' | 'degraded' | 'down';
}

import React, { useState, useEffect } from 'react';
import { monitoringApi } from '@shared/api/api';
interface Alert {
    type: string;
    level: 'warning' | 'critical';
    message: string;
    recommendation: string;
}
interface SystemStatus {
    overall_status: 'healthy' | 'degraded' | 'unhealthy';
    alerts: Alert[] | string[];
    performance?: {
        cpu_usage_percent?: number;
        memory_usage_percent?: number;
        disk_usage_percent?: number;
        available_memory_gb?: number;
        free_disk_gb?: number;
    };
}
const SystemStatusBanner: React.FC = () => {
    const [status, setStatus] = useState<SystemStatus | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);
    useEffect(() => {
        const checkSystemStatus = async () => {
            try {
                const healthData = await monitoringApi.getSystemHealth();
                if (!healthData || typeof healthData.overall_status !== 'string') {
                    console.warn('Invalid system health response structure');
                    setIsVisible(false);
                    return;
                }
                if (!Array.isArray(healthData.alerts)) {
                    healthData.alerts = [];
                }
                setStatus(healthData);
                if (healthData.overall_status !== 'healthy' || healthData.alerts.length > 0) {
                    setIsVisible(true);
                }
                else {
                    setIsVisible(false);
                }
            }
            catch (error: any) {
                if (error?.status === 401 || error?.status === 403) {
                    console.log('System health monitoring requires admin access');
                    setIsVisible(false);
                    return;
                }
                console.error('Failed to check system status:', error);
                setIsVisible(false);
            }
        };
        checkSystemStatus();
        const interval = setInterval(checkSystemStatus, 300000);
        return () => clearInterval(interval);
    }, []);
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'healthy':
                return 'bg-green-50 border-green-200 text-green-800';
            case 'degraded':
                return 'bg-yellow-50 border-yellow-200 text-yellow-800';
            case 'unhealthy':
                return 'bg-red-50 border-red-200 text-red-800';
            default:
                return 'bg-gray-50 border-gray-200 text-gray-800';
        }
    };
    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'healthy':
                return (<svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
          </svg>);
            case 'degraded':
                return (<svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
          </svg>);
            case 'unhealthy':
                return (<svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
          </svg>);
            default:
                return null;
        }
    };
    if (!status || !isVisible || isDismissed) {
        return null;
    }
    return (<div className={`border-l-4 p-4 ${getStatusColor(status.overall_status)}`}>
      <div className="flex">
        <div className="flex-shrink-0">
          {getStatusIcon(status.overall_status)}
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium">
            System Status: {status.overall_status.charAt(0).toUpperCase() + status.overall_status.slice(1)}
          </h3>

          {status.alerts.length > 0 && (<div className="mt-2">
              <ul className="text-sm space-y-1">
                {status.alerts.slice(0, 3).map((alert, index) => (<li key={index} className="flex items-start">
                    <span className="mr-2">•</span>
                    <div>
                      <div className="font-medium">
                        {typeof alert === 'string' ? alert : alert.message}
                      </div>
                      {typeof alert === 'object' && alert.recommendation && (<div className="text-xs opacity-75 mt-1">
                          💡 {alert.recommendation}
                        </div>)}
                    </div>
                  </li>))}
                {status.alerts.length > 3 && (<li className="text-xs opacity-75">
                    ... and {status.alerts.length - 3} more alerts
                  </li>)}
              </ul>
            </div>)}

          {status.performance && (<div className="mt-2 text-xs">
              {status.performance.cpu_usage_percent !== undefined && (<>CPU: {status.performance.cpu_usage_percent.toFixed(1)}%</>)}
              {status.performance.cpu_usage_percent !== undefined && status.performance.memory_usage_percent !== undefined && (<> | </>)}
              {status.performance.memory_usage_percent !== undefined && (<>Memory: {status.performance.memory_usage_percent.toFixed(1)}%</>)}
              {status.performance.disk_usage_percent !== undefined && (<> | Disk: {status.performance.disk_usage_percent.toFixed(1)}%</>)}
            </div>)}
        </div>

        <div className="ml-auto pl-3">
          <div className="-mx-1.5 -my-1.5">
            <button onClick={() => setIsDismissed(true)} className="inline-flex rounded-md p-1.5 hover:bg-opacity-20 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent focus:ring-gray-600">
              <span className="sr-only">Dismiss</span>
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>);
};
export default SystemStatusBanner;

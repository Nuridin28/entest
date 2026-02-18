import React, { useState, useEffect } from 'react';
import { monitoringApi } from '@shared/api/api';
interface SystemHealth {
    overall_status: string;
    timestamp: number;
    services: {
        cache?: {
            status: string;
            response_time?: number;
        };
        database?: {
            status: string;
            response_time?: number;
        };
        celery?: {
            status: string;
            active_workers?: number;
        };
    };
    performance?: {
        cpu_usage_percent?: number;
        memory_usage_percent?: number;
        disk_usage_percent?: number;
        available_memory_gb?: number;
        free_disk_gb?: number;
    };
    alerts: (string | {
        type: string;
        level: string;
        message: string;
        recommendation: string;
    })[];
}
interface CacheStats {
    memory: {
        used_memory?: number;
        used_memory_human?: string;
        max_memory?: number;
        memory_usage_percent?: number;
    };
    performance: {
        keyspace_hits?: number;
        keyspace_misses?: number;
        hit_rate?: number;
    };
    connections: {
        connected_clients?: number;
        total_connections_received?: number;
    };
}
const SystemMonitoring: React.FC = () => {
    const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
    const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
    const [activeTasks, setActiveTasks] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(true);
    useEffect(() => {
        fetchAllData();
        if (autoRefresh) {
            const interval = setInterval(fetchAllData, 30000);
            return () => clearInterval(interval);
        }
    }, [autoRefresh]);
    const fetchAllData = async () => {
        try {
            setLoading(true);
            const [healthData, cacheData, tasksData] = await Promise.all([
                monitoringApi.getSystemHealth(),
                monitoringApi.getCacheStats(),
                monitoringApi.getActiveTasks()
            ]);
            setSystemHealth(healthData);
            setCacheStats(cacheData);
            setActiveTasks(tasksData);
            setError(null);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch monitoring data');
        }
        finally {
            setLoading(false);
        }
    };
    const handleClearCache = async () => {
        try {
            await monitoringApi.clearCache();
            alert('Cache cleared successfully');
            fetchAllData();
        }
        catch (err) {
            alert('Failed to clear cache: ' + (err instanceof Error ? err.message : 'Unknown error'));
        }
    };
    const handleOptimizeSystem = async () => {
        try {
            await monitoringApi.optimizeSystem();
            alert('System optimization started');
        }
        catch (err) {
            alert('Failed to start optimization: ' + (err instanceof Error ? err.message : 'Unknown error'));
        }
    };
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'healthy':
                return 'text-green-600 bg-green-100';
            case 'degraded':
                return 'text-yellow-600 bg-yellow-100';
            case 'unhealthy':
                return 'text-red-600 bg-red-100';
            default:
                return 'text-gray-600 bg-gray-100';
        }
    };
    const getUsageColor = (percentage: number) => {
        if (percentage > 80)
            return 'bg-red-500';
        if (percentage > 60)
            return 'bg-yellow-500';
        return 'bg-green-500';
    };
    if (loading && !systemHealth) {
        return (<div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3">Loading system monitoring data...</span>
      </div>);
    }
    if (error) {
        return (<div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error loading monitoring data</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
            <button onClick={fetchAllData} className="mt-2 text-sm text-red-800 underline hover:text-red-900">
              Try again
            </button>
          </div>
        </div>
      </div>);
    }
    return (<div className="space-y-6">
      
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">System Monitoring</h2>
        <div className="flex space-x-3">
          <label className="flex items-center">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="mr-2"/>
            Auto-refresh
          </label>
          <button onClick={fetchAllData} className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
            Refresh
          </button>
          <button onClick={handleClearCache} className="px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700">
            Clear Cache
          </button>
          <button onClick={handleOptimizeSystem} className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700">
            Optimize System
          </button>
        </div>
      </div>

      
      {systemHealth && (<div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">System Health</h3>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(systemHealth.overall_status)}`}>
              {systemHealth.overall_status.toUpperCase()}
            </span>
          </div>
          
          
          {systemHealth.alerts.length > 0 && (<div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
              <h4 className="font-medium text-yellow-800 mb-2">Active Alerts</h4>
              <ul className="text-sm text-yellow-700 space-y-2">
                {systemHealth.alerts.map((alert, index) => (<li key={index} className="border-l-2 border-yellow-400 pl-3">
                    {typeof alert === 'string' ? (<span>• {alert}</span>) : (<div>
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${alert.level === 'critical' ? 'bg-red-100 text-red-800' :
                            alert.level === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-blue-100 text-blue-800'}`}>
                            {alert.level.toUpperCase()}
                          </span>
                          <span className="text-xs text-gray-500">{alert.type}</span>
                        </div>
                        <p className="font-medium mt-1">{alert.message}</p>
                        {alert.recommendation && (<p className="text-xs text-gray-600 mt-1 italic">
                            💡 {alert.recommendation}
                          </p>)}
                      </div>)}
                  </li>))}
              </ul>
            </div>)}

          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {Object.entries(systemHealth.services).map(([service, data]) => (<div key={service} className="border rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium capitalize">{service}</span>
                  <span className={`px-2 py-1 rounded text-xs ${getStatusColor(data.status)}`}>
                    {data.status}
                  </span>
                </div>
                {'response_time' in data && data.response_time && (<p className="text-sm text-gray-600">Response: {data.response_time}ms</p>)}
                {'active_workers' in data && data.active_workers !== undefined && (<p className="text-sm text-gray-600">Workers: {data.active_workers}</p>)}
              </div>))}
          </div>

          
          {systemHealth.performance && (<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {systemHealth.performance.cpu_usage_percent !== undefined && (<div className="border rounded p-3">
                  <h4 className="font-medium mb-2">CPU Usage</h4>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                    <div className={`h-2 rounded-full ${getUsageColor(systemHealth.performance.cpu_usage_percent)}`} style={{ width: `${systemHealth.performance.cpu_usage_percent}%` }}></div>
                  </div>
                  <p className="text-sm text-gray-600">{systemHealth.performance.cpu_usage_percent.toFixed(1)}%</p>
                </div>)}
              
              {systemHealth.performance.memory_usage_percent !== undefined && (<div className="border rounded p-3">
                  <h4 className="font-medium mb-2">Memory Usage</h4>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                    <div className={`h-2 rounded-full ${getUsageColor(systemHealth.performance.memory_usage_percent)}`} style={{ width: `${systemHealth.performance.memory_usage_percent}%` }}></div>
                  </div>
                  <p className="text-sm text-gray-600">
                    {systemHealth.performance.memory_usage_percent.toFixed(1)}% 
                    {systemHealth.performance.available_memory_gb !== undefined && (<>({systemHealth.performance.available_memory_gb.toFixed(1)}GB available)</>)}
                  </p>
                </div>)}
              
              {systemHealth.performance.disk_usage_percent !== undefined && (<div className="border rounded p-3">
                  <h4 className="font-medium mb-2">Disk Usage</h4>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                    <div className={`h-2 rounded-full ${getUsageColor(systemHealth.performance.disk_usage_percent)}`} style={{ width: `${systemHealth.performance.disk_usage_percent}%` }}></div>
                  </div>
                  <p className="text-sm text-gray-600">
                    {systemHealth.performance.disk_usage_percent.toFixed(1)}% 
                    {systemHealth.performance.free_disk_gb !== undefined && (<>({systemHealth.performance.free_disk_gb.toFixed(1)}GB free)</>)}
                  </p>
                </div>)}
            </div>)}
        </div>)}

      
      {cacheStats && (<div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Cache Performance</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="border rounded p-3">
              <h4 className="font-medium text-sm text-gray-600">Memory Usage</h4>
              <p className="text-lg font-semibold">{cacheStats.memory.used_memory_human || 'N/A'}</p>
              <p className="text-sm text-gray-500">
                {cacheStats.memory.memory_usage_percent !== undefined
                ? `${cacheStats.memory.memory_usage_percent.toFixed(1)}% used`
                : 'N/A'}
              </p>
            </div>
            
            <div className="border rounded p-3">
              <h4 className="font-medium text-sm text-gray-600">Hit Rate</h4>
              <p className="text-lg font-semibold text-green-600">
                {cacheStats.performance.hit_rate !== undefined
                ? `${cacheStats.performance.hit_rate.toFixed(1)}%`
                : 'N/A'}
              </p>
              <p className="text-sm text-gray-500">
                {cacheStats.performance.keyspace_hits !== undefined && cacheStats.performance.keyspace_misses !== undefined
                ? `${cacheStats.performance.keyspace_hits} hits / ${cacheStats.performance.keyspace_misses} misses`
                : 'N/A'}
              </p>
            </div>
            
            <div className="border rounded p-3">
              <h4 className="font-medium text-sm text-gray-600">Connections</h4>
              <p className="text-lg font-semibold">{cacheStats.connections.connected_clients || 'N/A'}</p>
              <p className="text-sm text-gray-500">
                {cacheStats.connections.total_connections_received !== undefined
                ? `${cacheStats.connections.total_connections_received} total`
                : 'N/A'}
              </p>
            </div>
            
            <div className="border rounded p-3">
              <h4 className="font-medium text-sm text-gray-600">Performance</h4>
              <p className="text-lg font-semibold text-blue-600">Optimized</p>
              <p className="text-sm text-gray-500">Redis cache active</p>
            </div>
          </div>
        </div>)}

      
      {activeTasks && (<div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Background Tasks</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border rounded p-3">
              <h4 className="font-medium text-sm text-gray-600">Active Tasks</h4>
              <p className="text-2xl font-bold text-blue-600">{activeTasks.total_active || 0}</p>
            </div>
            
            <div className="border rounded p-3">
              <h4 className="font-medium text-sm text-gray-600">Scheduled Tasks</h4>
              <p className="text-2xl font-bold text-yellow-600">{activeTasks.total_scheduled || 0}</p>
            </div>
            
            <div className="border rounded p-3">
              <h4 className="font-medium text-sm text-gray-600">Reserved Tasks</h4>
              <p className="text-2xl font-bold text-green-600">{activeTasks.total_reserved || 0}</p>
            </div>
          </div>
          
          {activeTasks.active_tasks && Object.keys(activeTasks.active_tasks).length > 0 && (<div className="mt-4">
              <h4 className="font-medium mb-2">Active Workers</h4>
              <div className="space-y-2">
                {Object.entries(activeTasks.active_tasks).map(([worker, tasks]: [
                    string,
                    any
                ]) => (<div key={worker} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                    <span className="font-mono text-sm">{worker}</span>
                    <span className="text-sm text-gray-600">{tasks.length} tasks</span>
                  </div>))}
              </div>
            </div>)}
        </div>)}
    </div>);
};
export default SystemMonitoring;

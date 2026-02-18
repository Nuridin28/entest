import React, { useState, useEffect } from 'react';
import { monitoringApi } from '@shared/api/api';
interface PerformanceMetrics {
    current_hour_metrics: {
        request_count: number;
        total_response_time: number;
        slow_requests: number;
        status_codes: Record<string, number>;
        paths: Record<string, {
            count: number;
            total_time: number;
        }>;
    };
    slow_requests: {
        count: number;
        recent: Array<{
            path: string;
            response_time: number;
            timestamp: number;
            method: string;
        }>;
    };
    errors: {
        count: number;
        recent: Array<{
            path: string;
            error: string;
            timestamp: number;
            method: string;
        }>;
    };
    trends: {
        response_time_trend: 'improving' | 'degrading';
        request_count_trend: 'increasing' | 'decreasing';
    };
}
const PerformanceDashboard: React.FC = () => {
    const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(true);
    useEffect(() => {
        fetchMetrics();
        if (autoRefresh) {
            const interval = setInterval(fetchMetrics, 30000);
            return () => clearInterval(interval);
        }
    }, [autoRefresh]);
    const fetchMetrics = async () => {
        try {
            setLoading(true);
            const data = await monitoringApi.getPerformanceMetrics();
            setMetrics(data);
            setError(null);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch performance metrics');
        }
        finally {
            setLoading(false);
        }
    };
    const formatTime = (timestamp: number) => {
        return new Date(timestamp * 1000).toLocaleTimeString();
    };
    const getTrendColor = (trend: string) => {
        switch (trend) {
            case 'improving':
                return 'text-green-600';
            case 'degrading':
                return 'text-red-600';
            default:
                return 'text-gray-600';
        }
    };
    const getTrendIcon = (trend: string) => {
        switch (trend) {
            case 'improving':
                return '↗️';
            case 'degrading':
                return '↘️';
            case 'increasing':
                return '📈';
            case 'decreasing':
                return '📉';
            default:
                return '➡️';
        }
    };
    if (loading && !metrics) {
        return (<div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3">Loading performance metrics...</span>
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
            <h3 className="text-sm font-medium text-red-800">Error loading performance data</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
            <button onClick={fetchMetrics} className="mt-2 text-sm text-red-800 underline hover:text-red-900">
              Try again
            </button>
          </div>
        </div>
      </div>);
    }
    if (!metrics)
        return null;
    const avgResponseTime = metrics.current_hour_metrics.request_count > 0
        ? (metrics.current_hour_metrics.total_response_time / metrics.current_hour_metrics.request_count).toFixed(2)
        : '0';
    return (<div className="space-y-6">
      
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Performance Dashboard</h2>
        <div className="flex space-x-3">
          <label className="flex items-center">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="mr-2"/>
            Auto-refresh
          </label>
          <button onClick={fetchMetrics} className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
            Refresh
          </button>
        </div>
      </div>

      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Total Requests</h3>
          <p className="text-2xl font-bold text-blue-600">
            {metrics.current_hour_metrics.request_count.toLocaleString()}
          </p>
          <p className="text-sm text-gray-500 mt-1">This hour</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Avg Response Time</h3>
          <p className="text-2xl font-bold text-green-600">{avgResponseTime}ms</p>
          <p className={`text-sm mt-1 ${getTrendColor(metrics.trends.response_time_trend)}`}>
            {getTrendIcon(metrics.trends.response_time_trend)} {metrics.trends.response_time_trend}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Slow Requests</h3>
          <p className="text-2xl font-bold text-yellow-600">
            {metrics.current_hour_metrics.slow_requests}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {((metrics.current_hour_metrics.slow_requests / Math.max(metrics.current_hour_metrics.request_count, 1)) * 100).toFixed(1)}% of total
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Error Count</h3>
          <p className="text-2xl font-bold text-red-600">{metrics.errors.count}</p>
          <p className="text-sm text-gray-500 mt-1">Recent errors</p>
        </div>
      </div>

      
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">HTTP Status Codes</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(metrics.current_hour_metrics.status_codes).map(([code, count]) => (<div key={code} className="text-center">
              <div className={`text-2xl font-bold ${code.startsWith('2') ? 'text-green-600' :
                code.startsWith('4') ? 'text-yellow-600' :
                    code.startsWith('5') ? 'text-red-600' : 'text-gray-600'}`}>
                {count}
              </div>
              <div className="text-sm text-gray-500">{code}</div>
            </div>))}
        </div>
      </div>

      
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Top Endpoints</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Endpoint
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Requests
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Avg Response Time
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries(metrics.current_hour_metrics.paths)
            .sort(([, a], [, b]) => b.count - a.count)
            .slice(0, 10)
            .map(([path, data]) => (<tr key={path}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {path}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {data.count}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {(data.total_time / data.count).toFixed(2)}ms
                  </td>
                </tr>))}
            </tbody>
          </table>
        </div>
      </div>

      
      {metrics.slow_requests.recent.length > 0 && (<div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Slow Requests</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Method
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Path
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Response Time
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {metrics.slow_requests.recent.map((request, index) => (<tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatTime(request.timestamp)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {request.method}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {request.path}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-medium">
                      {request.response_time.toFixed(2)}ms
                    </td>
                  </tr>))}
              </tbody>
            </table>
          </div>
        </div>)}

      
      {metrics.errors.recent.length > 0 && (<div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Errors</h3>
          <div className="space-y-3">
            {metrics.errors.recent.map((error, index) => (<div key={index} className="border-l-4 border-red-400 bg-red-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-800">
                      <span className="font-medium">{error.method} {error.path}</span>
                    </p>
                    <p className="text-sm text-red-700 mt-1">{error.error}</p>
                    <p className="text-xs text-red-600 mt-1">{formatTime(error.timestamp)}</p>
                  </div>
                </div>
              </div>))}
          </div>
        </div>)}
    </div>);
};
export default PerformanceDashboard;

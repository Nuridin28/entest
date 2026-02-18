#!/usr/bin/env python3
"""
System Health Check and Cleanup Script
Run this script to check system health and perform cleanup operations
"""

import asyncio
import sys
import os
import json
from datetime import datetime

                                      
sys.path.append('/app')

from app.core.database import AsyncSessionLocal
from app.core.cache import cache
from app.tasks.maintenance import cleanup_expired_sessions, cleanup_temp_files, optimize_cache
from sqlalchemy import text

async def check_database_health():
    """Check database connection and basic operations"""
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(text("SELECT version()"))
            version = result.scalar()
            await db.execute(text("SELECT COUNT(*) FROM information_schema.tables"))
            return {"status": "healthy", "version": version}
    except Exception as e:
        return {"status": "error", "error": str(e)}

async def check_cache_health():
    """Check Redis cache connection and performance"""
    try:
                               
        test_key = "health_check_test"
        test_value = {"timestamp": datetime.now().isoformat()}
        
                        
        await cache.aset(test_key, test_value, ttl=60)
        
                        
        retrieved = await cache.aget(test_key)
        
                  
        await cache.adelete(test_key)
        
        if retrieved == test_value:
            return {"status": "healthy", "operations": "passed"}
        else:
            return {"status": "degraded", "issue": "data_integrity"}
            
    except Exception as e:
        return {"status": "error", "error": str(e)}

def check_disk_space():
    """Check disk space usage"""
    try:
        import shutil
        total, used, free = shutil.disk_usage('/')
        usage_percent = (used / total) * 100
        
        status = "healthy"
        if usage_percent > 90:
            status = "critical"
        elif usage_percent > 80:
            status = "warning"
            
        return {
            "status": status,
            "total_gb": round(total / (1024**3), 2),
            "used_gb": round(used / (1024**3), 2),
            "free_gb": round(free / (1024**3), 2),
            "usage_percent": round(usage_percent, 2)
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}

def check_memory_usage():
    """Check memory usage"""
    try:
        import psutil
        memory = psutil.virtual_memory()
        
        status = "healthy"
        if memory.percent > 90:
            status = "critical"
        elif memory.percent > 80:
            status = "warning"
            
        return {
            "status": status,
            "total_gb": round(memory.total / (1024**3), 2),
            "used_gb": round(memory.used / (1024**3), 2),
            "available_gb": round(memory.available / (1024**3), 2),
            "usage_percent": memory.percent
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}

async def run_health_check():
    """Run comprehensive health check"""
    print("🔍 Running System Health Check...")
    print("=" * 50)
    
    health_report = {
        "timestamp": datetime.now().isoformat(),
        "overall_status": "healthy",
        "services": {}
    }
    
                    
    print("📊 Checking database...")
    db_health = await check_database_health()
    health_report["services"]["database"] = db_health
    print(f"   Database: {db_health['status']}")
    
                 
    print("🗄️  Checking cache...")
    cache_health = await check_cache_health()
    health_report["services"]["cache"] = cache_health
    print(f"   Cache: {cache_health['status']}")
    
                      
    print("💾 Checking disk space...")
    disk_health = check_disk_space()
    health_report["services"]["disk"] = disk_health
    print(f"   Disk: {disk_health['status']} ({disk_health.get('usage_percent', 0)}% used)")
    
                  
    print("🧠 Checking memory...")
    memory_health = check_memory_usage()
    health_report["services"]["memory"] = memory_health
    print(f"   Memory: {memory_health['status']} ({memory_health.get('usage_percent', 0)}% used)")
    
                              
    statuses = [service.get('status', 'unknown') for service in health_report["services"].values()]
    if 'critical' in statuses or 'error' in statuses:
        health_report["overall_status"] = "critical"
    elif 'warning' in statuses or 'degraded' in statuses:
        health_report["overall_status"] = "warning"
    
    print("=" * 50)
    print(f"🎯 Overall Status: {health_report['overall_status'].upper()}")
    
    return health_report

def run_cleanup():
    """Run system cleanup tasks"""
    print("🧹 Running System Cleanup...")
    print("=" * 50)
    
    cleanup_results = {}
    
                              
    print("🗑️  Cleaning expired sessions...")
    try:
        session_result = cleanup_expired_sessions.delay()
        cleanup_results["sessions"] = "scheduled"
        print("   ✅ Session cleanup scheduled")
    except Exception as e:
        cleanup_results["sessions"] = f"error: {str(e)}"
        print(f"   ❌ Session cleanup failed: {e}")
    
                        
    print("📁 Cleaning temporary files...")
    try:
        temp_result = cleanup_temp_files.delay()
        cleanup_results["temp_files"] = "scheduled"
        print("   ✅ Temp file cleanup scheduled")
    except Exception as e:
        cleanup_results["temp_files"] = f"error: {str(e)}"
        print(f"   ❌ Temp file cleanup failed: {e}")
    
                    
    print("⚡ Optimizing cache...")
    try:
        cache_result = optimize_cache.delay()
        cleanup_results["cache"] = "scheduled"
        print("   ✅ Cache optimization scheduled")
    except Exception as e:
        cleanup_results["cache"] = f"error: {str(e)}"
        print(f"   ❌ Cache optimization failed: {e}")
    
    print("=" * 50)
    print("🎯 Cleanup tasks have been scheduled")
    
    return cleanup_results

async def main():
    """Main function"""
    if len(sys.argv) > 1:
        command = sys.argv[1].lower()
        
        if command == "health":
            report = await run_health_check()
            
                                 
            report_file = f"/app/reports/health_check_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            os.makedirs(os.path.dirname(report_file), exist_ok=True)
            
            with open(report_file, 'w') as f:
                json.dump(report, f, indent=2)
            
            print(f"📄 Report saved to: {report_file}")
            
        elif command == "cleanup":
            results = run_cleanup()
            print("🎉 Cleanup completed!")
            
        elif command == "both":
            print("Running health check and cleanup...")
            await run_health_check()
            print("\n")
            run_cleanup()
            
        else:
            print("Usage: python system_health.py [health|cleanup|both]")
            sys.exit(1)
    else:
        print("Usage: python system_health.py [health|cleanup|both]")
        print("  health  - Run health check only")
        print("  cleanup - Run cleanup tasks only") 
        print("  both    - Run both health check and cleanup")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
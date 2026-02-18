from fastapi import APIRouter

from .endpoints import auth, users, main_tests, admin, proctoring, preliminary_tests, results, health, timezone, upload

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(upload.router, prefix="/upload", tags=["upload"])
api_router.include_router(main_tests.router, prefix="/main-tests", tags=["main-tests"])
api_router.include_router(preliminary_tests.router, prefix="/preliminary-tests", tags=["preliminary-tests"])
api_router.include_router(results.router, prefix="/results", tags=["results"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(proctoring.router, prefix="/proctoring", tags=["proctoring"])
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(timezone.router, prefix="/timezone", tags=["timezone"])



@api_router.get("/health")
async def health_check():
    return {"status": "ok", "message": "API is healthy"} 
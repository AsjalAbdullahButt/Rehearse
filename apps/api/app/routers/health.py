from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db

router = APIRouter()

API_VERSION = "0.1.0"


class HealthResponse(BaseModel):
    status: str
    version: str


@router.get("/health", response_model=HealthResponse)
async def get_health() -> HealthResponse:
    """Liveness: cheap, no dependencies — just confirms the process is up and serving."""
    return HealthResponse(status="ok", version=API_VERSION)


@router.get("/health/ready")
async def get_readiness(db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Readiness: a real DB round trip, so a load balancer/deploy check can tell 'process
    alive' (above) apart from 'actually able to serve a request'."""
    try:
        await db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return JSONResponse(
            {"status": "unavailable"}, status_code=status.HTTP_503_SERVICE_UNAVAILABLE
        )
    return JSONResponse({"status": "ready"})

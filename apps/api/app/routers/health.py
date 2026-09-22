from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

API_VERSION = "0.1.0"


class HealthResponse(BaseModel):
    status: str
    version: str


@router.get("/health", response_model=HealthResponse)
async def get_health() -> HealthResponse:
    return HealthResponse(status="ok", version=API_VERSION)

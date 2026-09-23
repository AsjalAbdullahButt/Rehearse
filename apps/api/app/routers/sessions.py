from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db import get_db
from app.models.user import User
from app.schemas.session import SessionCreate, SessionOut
from app.services import repo

router = APIRouter()


@router.post("/sessions", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
async def create_session(
    body: SessionCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionOut:
    session = await repo.create_session(
        db, user_id=user.id, role=body.role, difficulty=body.difficulty
    )
    return SessionOut.model_validate(session)


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SessionOut]:
    sessions = await repo.list_sessions_for_user(db, user_id=user.id)
    return [SessionOut.model_validate(session) for session in sessions]

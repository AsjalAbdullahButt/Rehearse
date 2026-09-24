"""Regression test for the row-level security MySQL doesn't have. Every repo function that
reads or writes a session/answer must be scoped to the caller's user_id — this test exists
because a forgotten filter here is a direct cross-user data leak, not a soft bug."""

from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.answer import Answer
from app.models.base import utcnow
from app.models.enums import Difficulty
from app.services import repo


async def _make_user(db_session: AsyncSession, email: str) -> str:
    user = await repo.create_user(
        db_session, email=email, password_hash="not-a-real-hash", display_name=None
    )
    return user.id


async def test_user_cannot_read_another_users_session(db_session: AsyncSession) -> None:
    user_a_id = await _make_user(db_session, "a@example.com")
    user_b_id = await _make_user(db_session, "b@example.com")

    session = await repo.create_session(
        db_session, user_id=user_a_id, role="backend", difficulty=Difficulty.MEDIUM
    )

    owner_read = await repo.get_session_for_user(
        db_session, session_id=session.id, user_id=user_a_id
    )
    other_read = await repo.get_session_for_user(
        db_session, session_id=session.id, user_id=user_b_id
    )

    assert owner_read is not None
    assert other_read is None


async def test_list_sessions_only_returns_the_callers_own_rows(db_session: AsyncSession) -> None:
    user_a_id = await _make_user(db_session, "a@example.com")
    user_b_id = await _make_user(db_session, "b@example.com")

    await repo.create_session(
        db_session, user_id=user_a_id, role="backend", difficulty=Difficulty.EASY
    )
    await repo.create_session(
        db_session, user_id=user_b_id, role="frontend", difficulty=Difficulty.EASY
    )

    a_sessions = await repo.list_sessions_for_user(db_session, user_id=user_a_id)

    assert len(a_sessions) == 1
    assert all(session.user_id == user_a_id for session in a_sessions)


async def test_user_cannot_read_another_users_answer(db_session: AsyncSession) -> None:
    user_a_id = await _make_user(db_session, "a@example.com")
    user_b_id = await _make_user(db_session, "b@example.com")

    session = await repo.create_session(
        db_session, user_id=user_a_id, role="backend", difficulty=Difficulty.EASY
    )
    answer = await repo.create_answer(
        db_session,
        answer=Answer(
            session_id=session.id,
            user_id=user_a_id,
            question_text="Tell me about yourself.",
            transcript="I'm a backend engineer with five years of experience.",
            duration_s=60,
            wpm=120,
        ),
    )

    owner_read = await repo.get_answer_for_user(db_session, answer_id=answer.id, user_id=user_a_id)
    other_read = await repo.get_answer_for_user(db_session, answer_id=answer.id, user_id=user_b_id)

    assert owner_read is not None
    assert other_read is None


async def test_list_answers_only_returns_the_callers_own_rows(db_session: AsyncSession) -> None:
    user_a_id = await _make_user(db_session, "a@example.com")
    user_b_id = await _make_user(db_session, "b@example.com")

    session_a = await repo.create_session(
        db_session, user_id=user_a_id, role="backend", difficulty=Difficulty.EASY
    )
    session_b = await repo.create_session(
        db_session, user_id=user_b_id, role="frontend", difficulty=Difficulty.EASY
    )

    await repo.create_answer(
        db_session,
        answer=Answer(
            session_id=session_a.id,
            user_id=user_a_id,
            question_text="Q",
            transcript="A",
            duration_s=30,
            wpm=100,
        ),
    )
    await repo.create_answer(
        db_session,
        answer=Answer(
            session_id=session_b.id,
            user_id=user_b_id,
            question_text="Q",
            transcript="A",
            duration_s=30,
            wpm=100,
        ),
    )

    a_answers = await repo.list_answers_for_user(db_session, user_id=user_a_id)

    assert len(a_answers) == 1
    assert all(answer.user_id == user_a_id for answer in a_answers)


async def test_logout_all_does_not_revoke_another_users_refresh_token(
    db_session: AsyncSession,
) -> None:
    user_a_id = await _make_user(db_session, "a@example.com")
    user_b_id = await _make_user(db_session, "b@example.com")
    expires_at = utcnow() + timedelta(days=1)

    await repo.store_refresh_token(
        db_session, user_id=user_a_id, token_hash="hash-a", expires_at=expires_at
    )
    await repo.store_refresh_token(
        db_session, user_id=user_b_id, token_hash="hash-b", expires_at=expires_at
    )

    await repo.revoke_all_refresh_tokens(db_session, user_id=user_a_id)

    assert await repo.get_active_refresh_token(db_session, token_hash="hash-a") is None
    assert await repo.get_active_refresh_token(db_session, token_hash="hash-b") is not None

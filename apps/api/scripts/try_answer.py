"""Posts a sample audio file to POST /v1/answers without the web UI, for manual testing
against a running API (with real GROQ_API_KEY / DATABASE_URL configured).

Usage:
  uv run python scripts/try_answer.py path/to/answer.webm \
      --role backend --difficulty medium
"""

import argparse
import sys
from pathlib import Path

import httpx


def _register_or_login(client: httpx.Client, email: str, password: str) -> str:
    register_response = client.post(
        "/v1/auth/register", json={"email": email, "password": password}
    )
    if register_response.status_code == 201:
        access_token: str = register_response.json()["access_token"]
        return access_token

    login_response = client.post("/v1/auth/login", json={"email": email, "password": password})
    login_response.raise_for_status()
    access_token = login_response.json()["access_token"]
    return access_token


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audio_path", type=Path)
    parser.add_argument("--api-url", default="http://localhost:8000")
    parser.add_argument("--role", default="backend")
    parser.add_argument("--difficulty", default="medium")
    parser.add_argument("--time-cap-s", type=int, default=120)
    parser.add_argument("--email", default="try-answer@example.com")
    parser.add_argument("--password", default="correct-horse-battery-staple")
    args = parser.parse_args()

    if not args.audio_path.exists():
        print(f"Audio file not found: {args.audio_path}", file=sys.stderr)
        return 1

    with httpx.Client(base_url=args.api_url, timeout=60) as client:
        access_token = _register_or_login(client, args.email, args.password)
        headers = {"Authorization": f"Bearer {access_token}"}

        session_response = client.post(
            "/v1/sessions",
            json={"role": args.role, "difficulty": args.difficulty},
            headers=headers,
        )
        session_response.raise_for_status()
        session_id = session_response.json()["id"]

        questions_response = client.get(
            "/v1/questions",
            params={"role": args.role, "difficulty": args.difficulty},
            headers=headers,
        )
        questions_response.raise_for_status()
        questions = questions_response.json()
        if not questions:
            print(
                f"No questions found for role={args.role} difficulty={args.difficulty}",
                file=sys.stderr,
            )
            return 1

        question = questions[0]
        print(f"Question: {question['text']}")

        content_type = "audio/ogg" if args.audio_path.suffix == ".ogg" else "audio/webm"
        with args.audio_path.open("rb") as audio_file:
            answer_response = client.post(
                "/v1/answers",
                data={
                    "session_id": session_id,
                    "question_id": question["id"],
                    "time_cap_s": str(args.time_cap_s),
                },
                files={"audio": (args.audio_path.name, audio_file, content_type)},
                headers=headers,
            )

        if answer_response.status_code >= 400:
            print(f"Error {answer_response.status_code}: {answer_response.text}", file=sys.stderr)
            return 1

        print(answer_response.json())

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

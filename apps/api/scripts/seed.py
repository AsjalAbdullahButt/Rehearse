"""Seeds the question bank (12 questions per role x 8 roles). Idempotent: skips roles that
already have questions, so it's safe to re-run against a DB that's already seeded.

Usage: uv run python scripts/seed.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from app.db import async_session_factory  # noqa: E402
from app.models.enums import Category, Difficulty, Role  # noqa: E402
from app.models.question import Question  # noqa: E402

# (role, difficulty, category, text)
QUESTIONS: list[tuple[Role, Difficulty, Category, str]] = [
    # ── software-engineer ────────────────────────────────────────────────
    (
        Role.SOFTWARE_ENGINEER,
        Difficulty.EASY,
        Category.BEHAVIORAL,
        "Tell me about yourself and your journey into software engineering.",
    ),
    (
        Role.SOFTWARE_ENGINEER,
        Difficulty.MEDIUM,
        Category.BEHAVIORAL,
        "Describe a time you disagreed with a teammate about a technical decision. "
        "How did you resolve it?",
    ),
    (
        Role.SOFTWARE_ENGINEER,
        Difficulty.MEDIUM,
        Category.BEHAVIORAL,
        "Tell me about a project you're most proud of and what made it successful.",
    ),
    (
        Role.SOFTWARE_ENGINEER,
        Difficulty.HARD,
        Category.BEHAVIORAL,
        "Describe a time you had to deliver bad news about a missed deadline. "
        "How did you handle it?",
    ),
    (
        Role.SOFTWARE_ENGINEER,
        Difficulty.EASY,
        Category.TECHNICAL,
        "Walk me through how you would debug a function that's returning incorrect results.",
    ),
    (
        Role.SOFTWARE_ENGINEER,
        Difficulty.MEDIUM,
        Category.TECHNICAL,
        "How would you design a URL shortening service?",
    ),
    (
        Role.SOFTWARE_ENGINEER,
        Difficulty.MEDIUM,
        Category.TECHNICAL,
        "Explain the tradeoffs between SQL and NoSQL databases for a given use case.",
    ),
    (
        Role.SOFTWARE_ENGINEER,
        Difficulty.HARD,
        Category.TECHNICAL,
        "How would you scale a system currently handling 1,000 requests per second "
        "to handle 100,000?",
    ),
    (
        Role.SOFTWARE_ENGINEER,
        Difficulty.EASY,
        Category.SITUATIONAL,
        "You just noticed a bug in production right before a release. What do you do?",
    ),
    (
        Role.SOFTWARE_ENGINEER,
        Difficulty.MEDIUM,
        Category.SITUATIONAL,
        "Your team is behind schedule on a sprint. How do you prioritize the remaining work?",
    ),
    (
        Role.SOFTWARE_ENGINEER,
        Difficulty.MEDIUM,
        Category.SITUATIONAL,
        "A teammate keeps submitting code without tests. How do you address this?",
    ),
    (
        Role.SOFTWARE_ENGINEER,
        Difficulty.HARD,
        Category.SITUATIONAL,
        "You inherit a legacy codebase with no documentation and a tight deadline. "
        "How do you approach it?",
    ),
    # ── frontend ──────────────────────────────────────────────────────────
    (
        Role.FRONTEND,
        Difficulty.EASY,
        Category.BEHAVIORAL,
        "Tell me about a UI you built that you're particularly proud of.",
    ),
    (
        Role.FRONTEND,
        Difficulty.MEDIUM,
        Category.BEHAVIORAL,
        "Describe a time you had to push back on a design that wasn't technically feasible.",
    ),
    (
        Role.FRONTEND,
        Difficulty.MEDIUM,
        Category.BEHAVIORAL,
        "Tell me about a time you improved the performance of a web application.",
    ),
    (
        Role.FRONTEND,
        Difficulty.HARD,
        Category.BEHAVIORAL,
        "Describe a conflict with a designer or product manager over UX priorities "
        "and how you resolved it.",
    ),
    (
        Role.FRONTEND,
        Difficulty.EASY,
        Category.TECHNICAL,
        "What's the difference between let, const, and var in JavaScript?",
    ),
    (
        Role.FRONTEND,
        Difficulty.MEDIUM,
        Category.TECHNICAL,
        "How would you optimize a React app that's re-rendering too often?",
    ),
    (
        Role.FRONTEND,
        Difficulty.MEDIUM,
        Category.TECHNICAL,
        "Explain how the browser's critical rendering path works.",
    ),
    (
        Role.FRONTEND,
        Difficulty.HARD,
        Category.TECHNICAL,
        "How would you architect a design system to be used across multiple product teams?",
    ),
    (
        Role.FRONTEND,
        Difficulty.EASY,
        Category.SITUATIONAL,
        "A stakeholder wants a pixel-perfect implementation that doesn't work responsively. "
        "What do you do?",
    ),
    (
        Role.FRONTEND,
        Difficulty.MEDIUM,
        Category.SITUATIONAL,
        "You discover a memory leak in production. How do you diagnose and fix it?",
    ),
    (
        Role.FRONTEND,
        Difficulty.MEDIUM,
        Category.SITUATIONAL,
        "Your team wants to adopt a new frontend framework. How do you evaluate whether "
        "it's worth the migration?",
    ),
    (
        Role.FRONTEND,
        Difficulty.HARD,
        Category.SITUATIONAL,
        "You need to support a product on very old browsers while keeping modern code clean. "
        "How do you handle it?",
    ),
    # ── backend ───────────────────────────────────────────────────────────
    (
        Role.BACKEND,
        Difficulty.EASY,
        Category.BEHAVIORAL,
        "Tell me about a backend system you designed from scratch.",
    ),
    (
        Role.BACKEND,
        Difficulty.MEDIUM,
        Category.BEHAVIORAL,
        "Describe a time a service you owned went down. What did you do?",
    ),
    (
        Role.BACKEND,
        Difficulty.MEDIUM,
        Category.BEHAVIORAL,
        "Tell me about a time you improved an API's reliability or performance.",
    ),
    (
        Role.BACKEND,
        Difficulty.HARD,
        Category.BEHAVIORAL,
        "Describe a disagreement with another team about an API contract and how it was resolved.",
    ),
    (
        Role.BACKEND,
        Difficulty.EASY,
        Category.TECHNICAL,
        "What's the difference between REST and GraphQL?",
    ),
    (
        Role.BACKEND,
        Difficulty.MEDIUM,
        Category.TECHNICAL,
        "How would you design a rate limiter for a public API?",
    ),
    (
        Role.BACKEND,
        Difficulty.MEDIUM,
        Category.TECHNICAL,
        "Explain how you'd handle database migrations with zero downtime.",
    ),
    (
        Role.BACKEND,
        Difficulty.HARD,
        Category.TECHNICAL,
        "How would you design a distributed job queue that guarantees at-least-once delivery?",
    ),
    (
        Role.BACKEND,
        Difficulty.EASY,
        Category.SITUATIONAL,
        "You notice a query is timing out intermittently in production. What's your first step?",
    ),
    (
        Role.BACKEND,
        Difficulty.MEDIUM,
        Category.SITUATIONAL,
        "Your service's error rate spikes after a deploy. Walk me through your response.",
    ),
    (
        Role.BACKEND,
        Difficulty.MEDIUM,
        Category.SITUATIONAL,
        "Two microservices are tightly coupled and causing cascading failures. "
        "How would you address it?",
    ),
    (
        Role.BACKEND,
        Difficulty.HARD,
        Category.SITUATIONAL,
        "You need to migrate a critical service to a new database with no downtime. "
        "How do you plan it?",
    ),
    # ── data-scientist ────────────────────────────────────────────────────
    (
        Role.DATA_SCIENTIST,
        Difficulty.EASY,
        Category.BEHAVIORAL,
        "Tell me about a data project where your analysis changed a business decision.",
    ),
    (
        Role.DATA_SCIENTIST,
        Difficulty.MEDIUM,
        Category.BEHAVIORAL,
        "Describe a time your analysis was wrong. How did you find out, and what did you do?",
    ),
    (
        Role.DATA_SCIENTIST,
        Difficulty.MEDIUM,
        Category.BEHAVIORAL,
        "Tell me about a time you had to explain a complex model to a non-technical stakeholder.",
    ),
    (
        Role.DATA_SCIENTIST,
        Difficulty.HARD,
        Category.BEHAVIORAL,
        "Describe a time you disagreed with a product decision based on data you had.",
    ),
    (
        Role.DATA_SCIENTIST,
        Difficulty.EASY,
        Category.TECHNICAL,
        "How do you handle missing data in a dataset?",
    ),
    (
        Role.DATA_SCIENTIST,
        Difficulty.MEDIUM,
        Category.TECHNICAL,
        "Explain the bias-variance tradeoff.",
    ),
    (
        Role.DATA_SCIENTIST,
        Difficulty.MEDIUM,
        Category.TECHNICAL,
        "How would you design an A/B test for a new feature?",
    ),
    (
        Role.DATA_SCIENTIST,
        Difficulty.HARD,
        Category.TECHNICAL,
        "How would you detect and handle data drift in a production model?",
    ),
    (
        Role.DATA_SCIENTIST,
        Difficulty.EASY,
        Category.SITUATIONAL,
        "Stakeholders want a definitive answer but your data is inconclusive. What do you do?",
    ),
    (
        Role.DATA_SCIENTIST,
        Difficulty.MEDIUM,
        Category.SITUATIONAL,
        "You find that a dataset used for a live model has quality issues. How do you respond?",
    ),
    (
        Role.DATA_SCIENTIST,
        Difficulty.MEDIUM,
        Category.SITUATIONAL,
        "Your analysis contradicts what leadership expects to hear. How do you present it?",
    ),
    (
        Role.DATA_SCIENTIST,
        Difficulty.HARD,
        Category.SITUATIONAL,
        "A model performs well in testing but poorly in production. How do you investigate?",
    ),
    # ── ml-engineer ───────────────────────────────────────────────────────
    (
        Role.ML_ENGINEER,
        Difficulty.EASY,
        Category.BEHAVIORAL,
        "Tell me about an ML model you took from prototype to production.",
    ),
    (
        Role.ML_ENGINEER,
        Difficulty.MEDIUM,
        Category.BEHAVIORAL,
        "Describe a time a model you deployed underperformed. What did you do?",
    ),
    (
        Role.ML_ENGINEER,
        Difficulty.MEDIUM,
        Category.BEHAVIORAL,
        "Tell me about a time you had to balance model accuracy against latency or "
        "cost constraints.",
    ),
    (
        Role.ML_ENGINEER,
        Difficulty.HARD,
        Category.BEHAVIORAL,
        "Describe a disagreement with a data scientist about a modeling approach and "
        "how it was resolved.",
    ),
    (
        Role.ML_ENGINEER,
        Difficulty.EASY,
        Category.TECHNICAL,
        "What's the difference between batch and online inference?",
    ),
    (
        Role.ML_ENGINEER,
        Difficulty.MEDIUM,
        Category.TECHNICAL,
        "How would you design a feature store for a team with multiple ML models?",
    ),
    (
        Role.ML_ENGINEER,
        Difficulty.MEDIUM,
        Category.TECHNICAL,
        "Explain how you'd monitor a model in production for degradation.",
    ),
    (
        Role.ML_ENGINEER,
        Difficulty.HARD,
        Category.TECHNICAL,
        "How would you design a system for retraining models automatically as new data arrives?",
    ),
    (
        Role.ML_ENGINEER,
        Difficulty.EASY,
        Category.SITUATIONAL,
        "A model's predictions suddenly look wrong in production. What's your first step?",
    ),
    (
        Role.ML_ENGINEER,
        Difficulty.MEDIUM,
        Category.SITUATIONAL,
        "You need to ship a model under a tight deadline with imperfect data. How do you proceed?",
    ),
    (
        Role.ML_ENGINEER,
        Difficulty.MEDIUM,
        Category.SITUATIONAL,
        "Your training pipeline is slow and blocking iteration. How do you speed it up?",
    ),
    (
        Role.ML_ENGINEER,
        Difficulty.HARD,
        Category.SITUATIONAL,
        "You discover your production model has a fairness or bias issue. How do you handle it?",
    ),
    # ── product-manager ───────────────────────────────────────────────────
    (
        Role.PRODUCT_MANAGER,
        Difficulty.EASY,
        Category.BEHAVIORAL,
        "Tell me about a product you shipped that you're proud of.",
    ),
    (
        Role.PRODUCT_MANAGER,
        Difficulty.MEDIUM,
        Category.BEHAVIORAL,
        "Describe a time you had to say no to a stakeholder's feature request.",
    ),
    (
        Role.PRODUCT_MANAGER,
        Difficulty.MEDIUM,
        Category.BEHAVIORAL,
        "Tell me about a time you used data to change the direction of a product.",
    ),
    (
        Role.PRODUCT_MANAGER,
        Difficulty.HARD,
        Category.BEHAVIORAL,
        "Describe a time a launch failed. What happened and what did you learn?",
    ),
    (
        Role.PRODUCT_MANAGER,
        Difficulty.EASY,
        Category.TECHNICAL,
        "How do you prioritize a backlog with limited engineering resources?",
    ),
    (
        Role.PRODUCT_MANAGER,
        Difficulty.MEDIUM,
        Category.TECHNICAL,
        "Walk me through how you'd define success metrics for a new feature.",
    ),
    (
        Role.PRODUCT_MANAGER,
        Difficulty.MEDIUM,
        Category.TECHNICAL,
        "How would you approach writing a PRD for a feature with ambiguous requirements?",
    ),
    (
        Role.PRODUCT_MANAGER,
        Difficulty.HARD,
        Category.TECHNICAL,
        "How would you decide whether to build, buy, or partner for a new capability?",
    ),
    (
        Role.PRODUCT_MANAGER,
        Difficulty.EASY,
        Category.SITUATIONAL,
        "Engineering says a requested feature will take twice as long as planned. What do you do?",
    ),
    (
        Role.PRODUCT_MANAGER,
        Difficulty.MEDIUM,
        Category.SITUATIONAL,
        "Two important stakeholders want conflicting priorities for the next sprint. "
        "How do you resolve it?",
    ),
    (
        Role.PRODUCT_MANAGER,
        Difficulty.MEDIUM,
        Category.SITUATIONAL,
        "User feedback and internal data are pointing in opposite directions. How do you decide?",
    ),
    (
        Role.PRODUCT_MANAGER,
        Difficulty.HARD,
        Category.SITUATIONAL,
        "A competitor just launched a feature your roadmap had planned for next quarter. "
        "How do you respond?",
    ),
    # ── ui-ux-designer ────────────────────────────────────────────────────
    (
        Role.UI_UX_DESIGNER,
        Difficulty.EASY,
        Category.BEHAVIORAL,
        "Walk me through a design project from research to final product.",
    ),
    (
        Role.UI_UX_DESIGNER,
        Difficulty.MEDIUM,
        Category.BEHAVIORAL,
        "Describe a time user research changed your design significantly.",
    ),
    (
        Role.UI_UX_DESIGNER,
        Difficulty.MEDIUM,
        Category.BEHAVIORAL,
        "Tell me about a time you had to defend a design decision to engineering or leadership.",
    ),
    (
        Role.UI_UX_DESIGNER,
        Difficulty.HARD,
        Category.BEHAVIORAL,
        "Describe a time you received harsh critique on your work. How did you respond?",
    ),
    (
        Role.UI_UX_DESIGNER,
        Difficulty.EASY,
        Category.TECHNICAL,
        "How do you approach designing for accessibility?",
    ),
    (
        Role.UI_UX_DESIGNER,
        Difficulty.MEDIUM,
        Category.TECHNICAL,
        "Walk me through your process for conducting a usability test.",
    ),
    (
        Role.UI_UX_DESIGNER,
        Difficulty.MEDIUM,
        Category.TECHNICAL,
        "How would you design an onboarding flow for a complex B2B product?",
    ),
    (
        Role.UI_UX_DESIGNER,
        Difficulty.HARD,
        Category.TECHNICAL,
        "How would you build and scale a design system across multiple product teams?",
    ),
    (
        Role.UI_UX_DESIGNER,
        Difficulty.EASY,
        Category.SITUATIONAL,
        "A stakeholder wants to skip user research to hit a deadline. What do you do?",
    ),
    (
        Role.UI_UX_DESIGNER,
        Difficulty.MEDIUM,
        Category.SITUATIONAL,
        "Your usability testing reveals users don't understand a core feature. How do you respond?",
    ),
    (
        Role.UI_UX_DESIGNER,
        Difficulty.MEDIUM,
        Category.SITUATIONAL,
        "Engineering says your design isn't technically feasible on the deadline. "
        "How do you handle it?",
    ),
    (
        Role.UI_UX_DESIGNER,
        Difficulty.HARD,
        Category.SITUATIONAL,
        "You're asked to redesign a product with data showing conflicting user needs "
        "across segments. How do you proceed?",
    ),
    # ── hr-general ────────────────────────────────────────────────────────
    (Role.HR_GENERAL, Difficulty.EASY, Category.BEHAVIORAL, "Tell me about yourself."),
    (
        Role.HR_GENERAL,
        Difficulty.EASY,
        Category.BEHAVIORAL,
        "Why are you interested in this role?",
    ),
    (
        Role.HR_GENERAL,
        Difficulty.MEDIUM,
        Category.BEHAVIORAL,
        "Tell me about a time you worked with a difficult team member.",
    ),
    (
        Role.HR_GENERAL,
        Difficulty.MEDIUM,
        Category.BEHAVIORAL,
        "Describe a time you failed at something. What did you learn?",
    ),
    (
        Role.HR_GENERAL,
        Difficulty.MEDIUM,
        Category.BEHAVIORAL,
        "Tell me about a time you had to manage multiple priorities under pressure.",
    ),
    (
        Role.HR_GENERAL,
        Difficulty.HARD,
        Category.BEHAVIORAL,
        "Describe a time you received difficult feedback. How did you respond?",
    ),
    (
        Role.HR_GENERAL,
        Difficulty.HARD,
        Category.BEHAVIORAL,
        "Tell me about a time you made a mistake that affected others. How did you handle it?",
    ),
    (
        Role.HR_GENERAL,
        Difficulty.EASY,
        Category.SITUATIONAL,
        "Where do you see yourself in five years?",
    ),
    (
        Role.HR_GENERAL,
        Difficulty.EASY,
        Category.SITUATIONAL,
        "What's your greatest strength, and how has it helped you at work?",
    ),
    (
        Role.HR_GENERAL,
        Difficulty.MEDIUM,
        Category.SITUATIONAL,
        "What's your greatest weakness, and what are you doing about it?",
    ),
    (
        Role.HR_GENERAL,
        Difficulty.MEDIUM,
        Category.SITUATIONAL,
        "How do you handle disagreements with your manager?",
    ),
    (
        Role.HR_GENERAL,
        Difficulty.HARD,
        Category.SITUATIONAL,
        "Why should we hire you over other candidates?",
    ),
]


async def seed() -> None:
    async with async_session_factory() as db:
        result = await db.execute(select(Question.role).distinct())
        seeded_roles = {row[0] for row in result.all()}

        to_insert = [
            Question(role=role, difficulty=difficulty, category=category, text=text)
            for role, difficulty, category, text in QUESTIONS
            if role not in seeded_roles
        ]

        if not to_insert:
            print("All roles already seeded, nothing to do.")
            return

        db.add_all(to_insert)
        await db.commit()
        print(f"Inserted {len(to_insert)} questions.")


if __name__ == "__main__":
    asyncio.run(seed())

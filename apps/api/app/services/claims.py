"""Claim probing and resume-consistency checking.

A real interviewer notices "I cut API latency by 40%" and asks how that was measured. This module
holds the deterministic parts of that behaviour: validating what the model extracted, deciding
whether a claim is worth probing under the current interviewer style, falling back to a templated
probe question if the LLM can't write one, and tracking how well a claim has been supported.

Nothing here accuses a candidate of anything. Claims are "unverified" until a follow-up answer
supports them; "contradictory" is never assigned automatically."""

import re
from collections.abc import Sequence
from dataclasses import dataclass

from app.models.interview_claim import InterviewClaim
from app.schemas.feedback import ConsistencyNote, ConsistencyNoteOut, ExtractedClaim
from app.services.interviewer_policy import InterviewerPolicy

IMPORTANCE_RANK = {"high": 3, "medium": 2, "low": 1}
MAX_RESUME_CLAIMS_PER_SESSION = 3

_WHITESPACE = re.compile(r"\s+")


def _normalize(text: str) -> str:
    return _WHITESPACE.sub(" ", text.lower()).strip(" .,!?;:\"'")


def appears_in(snippet: str, source: str) -> bool:
    needle = _normalize(snippet)
    return bool(needle) and needle in _normalize(source)


def verified_claims(claims: Sequence[ExtractedClaim], *, transcript: str) -> list[ExtractedClaim]:
    """Keeps only claims whose supporting quote is really in the transcript. The model is asked to
    quote; this enforces it, so the interviewer can never probe something that wasn't said."""
    return [c for c in claims if appears_in(c.quote, transcript)]


_CONSISTENCY_MESSAGES = {
    "role_emphasis": (
        "Your resume and this answer emphasise different responsibilities. A recruiter may ask "
        "you to clarify your exact contribution."
    ),
    "duration": (
        "The amount of experience in this answer may not match your resume. Potential recruiter "
        "follow-up — be ready to explain the difference."
    ),
    "skill_level": (
        "Your resume and this answer may describe your level with this skill differently. A "
        "possible mismatch worth preparing a clear explanation for."
    ),
    "other": (
        "This answer may not line up with something on your resume. Potential recruiter "
        "follow-up — clarification may be needed."
    ),
}


def verified_consistency(
    notes: Sequence[ConsistencyNote], *, transcript: str, resume_text: str | None
) -> list[ConsistencyNoteOut]:
    """Both quoted statements must really exist (answer in the transcript, resume statement in
    the candidate's background) or the note is dropped. Without resume text nothing can be
    checked, so nothing is returned."""
    if not resume_text:
        return []
    return [
        ConsistencyNoteOut(
            kind=note.kind,
            answer_statement=note.answer_statement,
            resume_statement=note.resume_statement,
            message=_CONSISTENCY_MESSAGES[note.kind],
        )
        for note in notes
        if appears_in(note.answer_statement, transcript)
        and appears_in(note.resume_statement, resume_text)
    ]


@dataclass(frozen=True)
class ClaimView:
    id: str
    text: str
    type: str
    importance: str
    metric: str | None
    competency: str | None
    chain_depth: int
    probe_count: int
    answer_id: str | None
    source: str


def view_of(claim: InterviewClaim) -> ClaimView:
    return ClaimView(
        id=claim.id,
        text=claim.claim_text,
        type=claim.claim_type,
        importance=claim.importance,
        metric=claim.metric,
        competency=claim.competency,
        chain_depth=claim.chain_depth,
        probe_count=claim.probe_count,
        answer_id=claim.answer_id,
        source=claim.source,
    )


def _min_rank(policy: InterviewerPolicy) -> int:
    """How important a claim must be to be worth probing: a supportive interviewer only presses
    the big ones, a challenging one probes anything substantive."""
    if policy.claim_challenge_level >= 0.8:
        return IMPORTANCE_RANK["low"]
    if policy.claim_challenge_level >= 0.5:
        return IMPORTANCE_RANK["medium"]
    return IMPORTANCE_RANK["high"]


def probe_budget(question_count: int) -> int:
    """At most about half the interview may be claim probes, so coverage of the job's skills is
    never crowded out."""
    return max(1, question_count // 2)


def choose_claim(
    claims: Sequence[ClaimView],
    *,
    policy: InterviewerPolicy,
    probes_used: int,
    question_count: int,
    last_answer_id: str | None,
    questions_asked: int,
) -> ClaimView | None:
    """The claim to probe next, or None. Claims from the answer just given come first (a natural
    follow-up), then the rest by importance; resume claims are only probed once the interview is
    under way. A claim is probed once, and a chain of probes is cut off at the style's depth
    budget."""
    if probes_used >= probe_budget(question_count):
        return None
    min_rank = _min_rank(policy)

    def eligible(claim: ClaimView) -> bool:
        if claim.probe_count > 0 or claim.chain_depth > policy.max_depth_probes:
            return False
        if IMPORTANCE_RANK.get(claim.importance, 0) < min_rank:
            return False
        return not (claim.source == "resume" and questions_asked < 1)

    candidates = [c for c in claims if eligible(c)]
    if not candidates:
        return None
    return min(
        candidates,
        key=lambda c: (
            0 if last_answer_id is not None and c.answer_id == last_answer_id else 1,
            -IMPORTANCE_RANK.get(c.importance, 0),
            c.chain_depth,
            c.text,
        ),
    )


_TEMPLATES = {
    "numeric": "You mentioned {subject}. How did you measure or arrive at that figure?",
    "performance": "You mentioned {subject}. How did you measure it, and what was the baseline?",
    "scale": "You mentioned {subject}. What did operating at that scale involve, and what broke?",
    "technical": "You mentioned {subject}. Walk me through how you actually implemented it.",
    "ownership": "You mentioned {subject}. What exactly was your personal contribution?",
    "leadership": "You mentioned {subject}. How did you handle disagreement or underperformance?",
    "team_size": "You mentioned {subject}. What was your role within that team specifically?",
    "business_impact": "You mentioned {subject}. How did you tie that to a business outcome?",
    "resume": "Your resume says {subject}. Can you walk me through a concrete example of it?",
}


def probe_fallback_text(claim: ClaimView) -> str:
    """A neutral templated probe, used when the LLM can't write one. `subject` is the claim's own
    (length-bounded) wording, so the candidate is asked about their own statement."""
    template = _TEMPLATES.get(claim.type, _TEMPLATES["technical"])
    subject = claim.text.strip().rstrip(".")
    return template.format(subject=f'"{subject}"')


_PANELIST_FOR_CLAIM = {
    "technical": "tech_lead",
    "performance": "tech_lead",
    "scale": "tech_lead",
    "numeric": "tech_lead",
    "ownership": "manager",
    "leadership": "manager",
    "team_size": "manager",
    "business_impact": "manager",
    "resume": "recruiter",
}


def panelist_for_claim(claim_type: str) -> str:
    return _PANELIST_FOR_CLAIM.get(claim_type, "tech_lead")


# ─── support tracking ────────────────────────────────────────────────────

SUPPORTED_SCORE = 7.0
PARTIAL_SCORE = 5.0


def status_after_probe(current_depth: int, score_0_to_10: float) -> tuple[str, int]:
    """(status, verified_depth) after the candidate answered a probe of this claim. A strong
    answer adds a level of verified depth; two supported levels (or one strong answer to a deep
    probe) make it well supported. A weak answer never marks anything contradictory — it simply
    leaves the claim for the candidate to prepare."""
    if score_0_to_10 >= SUPPORTED_SCORE:
        depth = current_depth + 1
        return ("well_supported" if depth >= 2 else "partially_supported"), depth
    if score_0_to_10 >= PARTIAL_SCORE:
        return "partially_supported", current_depth
    return "unverified", current_depth


def build_claim_rows(
    extracted: Sequence[ExtractedClaim],
    *,
    session_id: str,
    user_id: str,
    answer_id: str,
    competency: str | None,
    parent: InterviewClaim | None,
) -> list[InterviewClaim]:
    return [
        InterviewClaim(
            session_id=session_id,
            user_id=user_id,
            answer_id=answer_id,
            parent_claim_id=parent.id if parent else None,
            source="answer",
            claim_text=claim.claim,
            claim_type=claim.type,
            importance=claim.importance,
            metric=claim.metric,
            competency=competency,
            chain_depth=(parent.chain_depth + 1) if parent else 0,
        )
        for claim in extracted
    ]

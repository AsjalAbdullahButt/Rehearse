from pydantic import BaseModel


class ClaimOut(BaseModel):
    """A statement worth preparing for. Wording is deliberately soft: an unverified claim is one
    a recruiter may follow up on, not one anybody doubts."""

    id: str
    claim_text: str
    claim_type: str
    importance: str
    metric: str | None
    source: str
    status: str
    note: str | None

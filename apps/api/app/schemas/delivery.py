"""Delivery coaching: how an answer *sounded* (and, optionally, looked), kept apart from how good
its content was.

`ProsodySummary` and `CameraSummary` are what the browser measures locally and sends as a handful
of numbers — never audio, video or frames. They are untrusted client input: every field is
bounded, and the report labels them as browser-measured."""

from typing import Literal

from pydantic import BaseModel, Field

Rating = Literal["good", "ok", "needs_work", "not_measured"]


class ProsodySummary(BaseModel):
    """Voice measurements taken in the browser from the microphone signal while recording."""

    frames: int = Field(ge=0, le=200_000)
    voiced_frames: int = Field(ge=0, le=200_000)
    pitch_std_semitones: float | None = Field(default=None, ge=0, le=24)
    pitch_median_hz: float | None = Field(default=None, ge=50, le=500)
    energy_cv: float = Field(ge=0, le=10)
    volume_std_db: float = Field(ge=0, le=40)
    mean_db: float = Field(ge=-120, le=0)


class CameraSummary(BaseModel):
    """Presentation measurements from the optional camera coach (head pose / presence only)."""

    frames: int = Field(ge=0, le=200_000)
    duration_s: float = Field(ge=0, le=3_600)
    face_present_ratio: float = Field(ge=0, le=1)
    looking_away_ratio: float = Field(ge=0, le=1)
    away_events: int = Field(ge=0, le=1_000)
    head_motion_deg_per_s: float = Field(ge=0, le=720)


class DeliveryItem(BaseModel):
    key: str
    label: str
    rating: Rating
    detail: str


class DeliveryReport(BaseModel):
    """Voice and pacing, from word timings (always available) plus browser-measured pitch and
    energy (when the browser provided them). Never folded into the content score."""

    items: list[DeliveryItem]
    advice: list[str]
    # Whether pitch/energy were measured; if not, those items say "not measured" rather than
    # guessing.
    voice_measured: bool


class VisualDelivery(BaseModel):
    """Optional camera coaching. Presentation only: no claim about honesty, confidence,
    personality or emotion, and never combined with the content or communication scores."""

    items: list[DeliveryItem]
    advice: list[str]
    disclaimer: str

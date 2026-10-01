"""Delivery analysis: pacing, pauses, rhythm and response latency from the word timings Whisper
already gave us, plus pitch/energy/volume from a summary the browser measured locally.

Every rating is a transparent threshold over a measured number, and the advice text is composed
from those ratings in code — no model is asked to guess how someone sounded. Where a signal was
not measured the item says so instead of inventing a value.

All functions are pure."""

from collections.abc import Sequence
from statistics import mean, pstdev

from app.schemas.delivery import (
    CameraSummary,
    DeliveryItem,
    DeliveryReport,
    ProsodySummary,
    Rating,
    VisualDelivery,
)
from app.schemas.transcription import WordTiming

# ── thresholds (named so the report and tests agree on them) ──
SLOW_WPM = 110
RUSHED_WPM = 170
WINDOW_S = 10.0
RUSHED_WINDOW_WPM = 190
BURST_GAP_S = 0.5
MIN_BURSTS_FOR_RHYTHM = 4
UNEVEN_BURST_CV = 1.1
LONG_PAUSE_S = 2.0
SLOW_START_S = 4.0
PROMPT_START_S = 1.5
LOW_PITCH_STD = 1.8
OK_PITCH_STD = 3.5
LOW_ENERGY_CV = 0.35
OK_ENERGY_CV = 0.7
UNSTEADY_VOLUME_DB = 8.0
QUIET_MEAN_DB = -50.0
# Below this many voiced frames (~50ms each) the voice summary is too thin to trust.
MIN_VOICED_FRAMES = 40


def _bursts(words: Sequence[WordTiming]) -> list[float]:
    """Durations of uninterrupted speaking stretches: runs of words with gaps under BURST_GAP_S."""
    durations: list[float] = []
    start = words[0].start
    previous_end = words[0].end
    for word in words[1:]:
        if word.start - previous_end >= BURST_GAP_S:
            durations.append(previous_end - start)
            start = word.start
        previous_end = word.end
    durations.append(previous_end - start)
    return durations


def _window_wpms(words: Sequence[WordTiming]) -> list[float]:
    if not words:
        return []
    end = words[-1].end
    wpms: list[float] = []
    window_start = words[0].start
    while window_start < end:
        window_end = window_start + WINDOW_S
        count = sum(1 for w in words if window_start <= w.start < window_end)
        span = min(window_end, end) - window_start
        # A tiny tail window would produce a noisy rate; only full-ish windows count.
        if span >= WINDOW_S * 0.6:
            wpms.append(count / span * 60)
        window_start = window_end
    return wpms


def _pace_item(wpm: float, windows: Sequence[float]) -> DeliveryItem:
    if wpm < SLOW_WPM:
        rating: Rating = "needs_work"
        detail = f"{round(wpm)} words per minute is on the slow side."
    elif wpm > RUSHED_WPM:
        rating = "needs_work"
        detail = f"{round(wpm)} words per minute is fast; listeners may struggle to keep up."
    else:
        rating = "good"
        detail = f"{round(wpm)} words per minute is a comfortable pace."
        rushed = [w for w in windows if w > RUSHED_WINDOW_WPM]
        if windows and rushed:
            rating = "ok"
            detail += f" You sped up in {len(rushed)} of {len(windows)} stretches."
    return DeliveryItem(key="pace", label="Pace", rating=rating, detail=detail)


def _pause_item(words: Sequence[WordTiming], duration_s: float) -> DeliveryItem:
    gaps = [b.start - a.end for a, b in zip(words, words[1:], strict=False) if b.start > a.end]
    long_pauses = [g for g in gaps if g > LONG_PAUSE_S]
    per_minute = len(long_pauses) / max(duration_s / 60, 1 / 6)
    medium = [g for g in gaps if 0.7 <= g <= LONG_PAUSE_S]
    if per_minute <= 1:
        rating: Rating = "good"
    elif per_minute <= 3:
        rating = "ok"
    else:
        rating = "needs_work"
    detail = (
        f"{len(long_pauses)} pause{'s' if len(long_pauses) != 1 else ''} longer than "
        f"{LONG_PAUSE_S:.0f}s and {len(medium)} medium pause{'s' if len(medium) != 1 else ''}."
    )
    return DeliveryItem(key="pauses", label="Pause control", rating=rating, detail=detail)


def _latency_item(words: Sequence[WordTiming]) -> DeliveryItem:
    latency = words[0].start
    if latency <= PROMPT_START_S:
        rating: Rating = "good"
        detail = f"You started speaking after {latency:.1f}s."
    elif latency <= SLOW_START_S:
        rating = "ok"
        detail = f"You started speaking after {latency:.1f}s — a short think is fine."
    else:
        rating = "needs_work"
        detail = f"It took {latency:.1f}s before you started speaking."
    return DeliveryItem(key="latency", label="Time to first word", rating=rating, detail=detail)


def _rhythm_item(words: Sequence[WordTiming]) -> DeliveryItem:
    bursts = _bursts(words)
    if len(bursts) < MIN_BURSTS_FOR_RHYTHM:
        return DeliveryItem(
            key="rhythm",
            label="Speaking rhythm",
            rating="not_measured",
            detail="Too short an answer to judge rhythm.",
        )
    cv = pstdev(bursts) / mean(bursts)
    if cv <= UNEVEN_BURST_CV * 0.7:
        rating: Rating = "good"
        detail = "Your phrasing came in an even, steady rhythm."
    elif cv <= UNEVEN_BURST_CV:
        rating = "ok"
        detail = "Your phrasing varied somewhat in length."
    else:
        rating = "needs_work"
        detail = "Your phrasing alternated between very long runs and short fragments."
    return DeliveryItem(key="rhythm", label="Speaking rhythm", rating=rating, detail=detail)


_NOT_MEASURED = "Not measured for this answer."


def _voice_items(prosody: ProsodySummary | None) -> tuple[list[DeliveryItem], bool]:
    if prosody is None or prosody.voiced_frames < MIN_VOICED_FRAMES:
        return (
            [
                DeliveryItem(key=key, label=label, rating="not_measured", detail=_NOT_MEASURED)
                for key, label in (
                    ("pitch", "Pitch variation"),
                    ("energy", "Energy"),
                    ("volume", "Volume steadiness"),
                    ("monotony", "Monotony"),
                )
            ],
            False,
        )

    items: list[DeliveryItem] = []
    pitch_known = prosody.pitch_std_semitones is not None
    if pitch_known and prosody.pitch_std_semitones is not None:
        std = prosody.pitch_std_semitones
        rating: Rating = (
            "needs_work" if std < LOW_PITCH_STD else ("ok" if std < OK_PITCH_STD else "good")
        )
        detail = {
            "needs_work": "Your pitch stayed close to flat.",
            "ok": "Your pitch moved a little.",
            "good": "Your pitch varied naturally.",
        }[rating]
        items.append(
            DeliveryItem(key="pitch", label="Pitch variation", rating=rating, detail=detail)
        )
    else:
        items.append(
            DeliveryItem(
                key="pitch",
                label="Pitch variation",
                rating="not_measured",
                detail="Pitch could not be tracked reliably on this microphone.",
            )
        )

    energy_rating: Rating = (
        "needs_work"
        if prosody.energy_cv < LOW_ENERGY_CV
        else ("ok" if prosody.energy_cv < OK_ENERGY_CV else "good")
    )
    items.append(
        DeliveryItem(
            key="energy",
            label="Energy",
            rating=energy_rating,
            detail={
                "needs_work": "Your energy stayed almost constant throughout.",
                "ok": "Your energy rose and fell a little.",
                "good": "Your energy rose and fell, emphasising key points.",
            }[energy_rating],
        )
    )

    if prosody.mean_db < QUIET_MEAN_DB:
        volume_rating: Rating = "needs_work"
        volume_detail = "Your voice was quiet; move closer to the microphone or speak up."
    elif prosody.volume_std_db > UNSTEADY_VOLUME_DB:
        volume_rating = "ok"
        volume_detail = "Your volume swung noticeably between loud and soft."
    else:
        volume_rating = "good"
        volume_detail = "Your volume stayed steady."
    items.append(
        DeliveryItem(
            key="volume", label="Volume steadiness", rating=volume_rating, detail=volume_detail
        )
    )

    flat_signals = int(energy_rating == "needs_work") + int(
        pitch_known and items[0].rating == "needs_work"
    )
    monotony: Rating = (
        "good" if flat_signals == 0 else ("ok" if flat_signals == 1 else "needs_work")
    )
    items.append(
        DeliveryItem(
            key="monotony",
            label="Monotony",
            rating=monotony,
            detail={
                "good": "Your delivery sounded varied.",
                "ok": "Part of your delivery sounded flat.",
                "needs_work": "Your delivery sounded flat — little change in pitch or energy.",
            }[monotony],
        )
    )
    return items, True


def _advice(items: Sequence[DeliveryItem], voice_measured: bool) -> list[str]:
    by_key = {item.key: item for item in items}

    def weak(key: str) -> bool:
        return key in by_key and by_key[key].rating == "needs_work"

    advice: list[str] = []
    pace_ok = by_key["pace"].rating in ("good", "ok")
    if weak("monotony") or (weak("energy") and weak("pitch")):
        lead = "Your pace was controlled, but " if pace_ok else "Your delivery stayed flat: "
        advice.append(
            lead + "your energy and pitch barely changed. Emphasising important decisions and "
            "results would make the answer sound more confident."
        )
    elif weak("energy"):
        advice.append(
            "Your energy stayed almost constant. Lift your voice slightly on the result or the "
            "key decision so the main point stands out."
        )
    elif weak("pitch"):
        advice.append(
            "Your pitch stayed fairly flat. Vary your tone when you move from context to outcome."
        )
    if weak("pace"):
        advice.append(
            "Aim for roughly 130-160 words per minute; pause briefly between ideas."
            if "fast" in by_key["pace"].detail
            else "Try to speak a little faster and keep your sentences moving."
        )
    if weak("pauses"):
        advice.append(
            "Long silences broke up the answer. Use a short bridging phrase while you think."
        )
    if weak("latency"):
        advice.append(
            "Take a breath and start with a one-line answer, then add detail, rather than waiting "
            "to have the whole answer ready."
        )
    if weak("rhythm"):
        advice.append("Group your points into clear sentences of similar length.")
    if weak("volume"):
        advice.append("Check your microphone distance and keep your volume consistent.")
    if not advice:
        advice.append(
            "Your delivery was solid"
            + (" on every measure we could take." if voice_measured else " on pace and pausing.")
        )
    return advice[:3]


def build_delivery(
    words: Sequence[WordTiming],
    *,
    duration_s: float,
    wpm: float,
    prosody: ProsodySummary | None,
) -> DeliveryReport | None:
    """None when there is no usable timing data (an old or empty answer)."""
    if len(words) < 2 or duration_s <= 0:
        return None
    voice_items, voice_measured = _voice_items(prosody)
    items = [
        _pace_item(wpm, _window_wpms(words)),
        _pause_item(words, duration_s),
        _latency_item(words),
        _rhythm_item(words),
        *voice_items,
    ]
    return DeliveryReport(
        items=items, advice=_advice(items, voice_measured), voice_measured=voice_measured
    )


# ─── optional camera coaching ────────────────────────────────────────────

AWAY_RATIO_OK = 0.2
AWAY_RATIO_HIGH = 0.4
PRESENT_RATIO_LOW = 0.8
HEAD_MOTION_OK = 12.0
HEAD_MOTION_HIGH = 25.0
MIN_CAMERA_FRAMES = 30

VISUAL_DISCLAIMER = (
    "Presentation coaching only, measured on your device from head position. It says nothing "
    "about honesty, confidence, personality or emotion, and it never affects your scores."
)


def build_visual_delivery(camera: CameraSummary | None) -> VisualDelivery | None:
    if camera is None or camera.frames < MIN_CAMERA_FRAMES:
        return None

    present: Rating = "good" if camera.face_present_ratio >= PRESENT_RATIO_LOW else "needs_work"
    away_ratio = camera.looking_away_ratio
    away: Rating = (
        "good"
        if away_ratio <= AWAY_RATIO_OK
        else ("ok" if away_ratio <= AWAY_RATIO_HIGH else "needs_work")
    )
    motion: Rating = (
        "good"
        if camera.head_motion_deg_per_s <= HEAD_MOTION_OK
        else ("ok" if camera.head_motion_deg_per_s <= HEAD_MOTION_HIGH else "needs_work")
    )
    items = [
        DeliveryItem(
            key="framing",
            label="In frame",
            rating=present,
            detail=f"Your face was in frame {round(camera.face_present_ratio * 100)}% of the time.",
        ),
        DeliveryItem(
            key="looking_away",
            label="Looking toward the camera",
            rating=away,
            detail=(
                f"Your head was turned away from the camera about {round(away_ratio * 100)}% "
                f"of the time ({camera.away_events} separate times)."
            ),
        ),
        DeliveryItem(
            key="movement",
            label="Head movement",
            rating=motion,
            detail=(
                f"Average head movement was {camera.head_motion_deg_per_s:.0f} degrees per second."
            ),
        ),
    ]
    advice: list[str] = []
    if present == "needs_work":
        advice.append("Frame yourself so your face stays in view for the whole answer.")
    if away == "needs_work":
        advice.append(
            "You often turned away from the camera. Glance at notes sparingly and return to the "
            "lens between points."
        )
    elif away == "ok":
        advice.append("Try to hold your head toward the camera a little more while speaking.")
    if motion == "needs_work":
        advice.append("Keep your head steadier; large movements can distract from what you say.")
    if not advice:
        advice.append("Your on-camera presentation looked steady and well framed.")
    return VisualDelivery(items=items, advice=advice[:3], disclaimer=VISUAL_DISCLAIMER)

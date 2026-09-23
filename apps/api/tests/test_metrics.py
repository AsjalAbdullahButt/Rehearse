from app.schemas.transcription import WordTiming
from app.services.metrics import (
    assess_rambling,
    compute_wpm,
    count_fillers,
    count_long_pauses,
)


def test_count_fillers_counts_single_word_fillers_case_insensitively() -> None:
    total, breakdown = count_fillers("Um, so I, uh, basically started the project.")

    assert total == 3
    assert breakdown == {"um": 1, "uh": 1, "basically": 1}


def test_count_fillers_counts_multi_word_phrases() -> None:
    total, breakdown = count_fillers("It was, you know, sort of hard, you know?")

    assert total == 3
    assert breakdown == {"you know": 2, "sort of": 1}


def test_count_fillers_returns_zero_for_a_clean_transcript() -> None:
    total, breakdown = count_fillers("I led the migration and cut latency by half.")

    assert total == 0
    assert breakdown == {}


def test_count_fillers_does_not_match_filler_words_inside_other_words() -> None:
    # "umbrella" contains "um" but must not be counted as the filler "um" — word-boundary
    # tokenizing (not substring search) is what makes this the correct behavior.
    total, breakdown = count_fillers("I forgot my umbrella at the office.")

    assert total == 0
    assert breakdown == {}


def test_compute_wpm_normal_case() -> None:
    assert compute_wpm(word_count=150, duration_s=60) == 150.0


def test_compute_wpm_rounds_to_one_decimal() -> None:
    assert compute_wpm(word_count=100, duration_s=45) == 133.3


def test_compute_wpm_returns_zero_for_zero_duration() -> None:
    assert compute_wpm(word_count=10, duration_s=0) == 0.0


def test_compute_wpm_returns_zero_for_negative_duration() -> None:
    assert compute_wpm(word_count=10, duration_s=-5) == 0.0


def _word(word: str, start: float, end: float) -> WordTiming:
    return WordTiming(word=word, start=start, end=end)


def test_count_long_pauses_counts_gaps_over_threshold() -> None:
    words = [
        _word("I", 0.0, 0.2),
        _word("paused", 3.0, 3.5),  # 2.8s gap — long pause
        _word("here", 4.0, 4.3),  # 0.5s gap — not long
    ]

    assert count_long_pauses(words) == 1


def test_count_long_pauses_boundary_is_strictly_greater_than() -> None:
    # A gap of exactly 2.0s must not count — the threshold is ">2.0s", not ">=2.0s".
    words = [_word("a", 0.0, 0.5), _word("b", 2.5, 3.0)]

    assert count_long_pauses(words) == 0


def test_count_long_pauses_returns_zero_for_fewer_than_two_words() -> None:
    assert count_long_pauses([]) == 0
    assert count_long_pauses([_word("only", 0.0, 0.5)]) == 0


def test_assess_rambling_returns_none_within_the_ideal_range() -> None:
    assert assess_rambling(90.0) is None


def test_assess_rambling_returns_none_within_the_grace_window() -> None:
    assert assess_rambling(140.0) is None  # 120 + 20, still under the 30s grace


def test_assess_rambling_flags_well_past_the_grace_window() -> None:
    assert assess_rambling(200.0) == "rambling"


def test_assess_rambling_boundary_is_strictly_greater_than() -> None:
    assert assess_rambling(150.0) is None  # exactly at 120 + 30 grace, not over it
    assert assess_rambling(150.01) == "rambling"

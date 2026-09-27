from app.models.enums import Category
from app.schemas.transcription import WordTiming
from app.services.metrics import (
    assess_confidence,
    assess_rambling,
    assess_transcription_quality,
    avg_pause_s,
    build_transcript_parts,
    compute_wpm,
    count_fillers,
    count_long_pauses,
    filler_rate_per_100_words,
    max_pause_s,
    total_long_pause_s,
)


def test_count_fillers_counts_definite_fillers_case_insensitively() -> None:
    counts = count_fillers("Um, so I, uh, started the project.")

    assert counts.definite_count == 2
    assert counts.definite_breakdown == {"um": 1, "uh": 1}


def test_count_fillers_keeps_possible_fillers_separate_from_definite() -> None:
    # "basically" is a possible-tier filler, not definite — it must not be folded into
    # definite_count/definite_breakdown alongside "um"/"uh".
    counts = count_fillers("Um, so I, uh, basically started the project.")

    assert counts.definite_count == 2
    assert counts.definite_breakdown == {"um": 1, "uh": 1}
    assert counts.possible_count == 1
    assert counts.possible_breakdown == {"basically": 1}


def test_count_fillers_counts_possible_multi_word_phrases() -> None:
    counts = count_fillers("It was, you know, sort of hard, you know?")

    assert counts.possible_count == 3
    assert counts.possible_breakdown == {"you know": 2, "sort of": 1}
    assert counts.definite_count == 0


def test_count_fillers_returns_zero_for_a_clean_transcript() -> None:
    counts = count_fillers("I led the migration and cut latency by half.")

    assert counts.definite_count == 0
    assert counts.possible_count == 0


def test_count_fillers_does_not_match_filler_words_inside_other_words() -> None:
    # "umbrella" contains "um" but must not be counted as the filler "um" — word-boundary
    # tokenizing (not substring search) is what makes this the correct behavior.
    counts = count_fillers("I forgot my umbrella at the office.")

    assert counts.definite_count == 0
    assert counts.possible_count == 0


def test_filler_rate_per_100_words_normal_case() -> None:
    assert filler_rate_per_100_words(filler_count=5, word_count=100) == 5.0


def test_filler_rate_per_100_words_returns_zero_for_zero_words() -> None:
    assert filler_rate_per_100_words(filler_count=0, word_count=0) == 0.0


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


def test_max_pause_s_returns_the_largest_gap() -> None:
    words = [_word("a", 0.0, 0.5), _word("b", 3.0, 3.2), _word("c", 4.0, 4.3)]

    assert max_pause_s(words) == 2.5


def test_max_pause_s_returns_none_for_fewer_than_two_words() -> None:
    assert max_pause_s([]) is None
    assert max_pause_s([_word("only", 0.0, 0.5)]) is None


def test_total_long_pause_s_sums_only_gaps_over_the_threshold() -> None:
    words = [
        _word("a", 0.0, 0.5),
        _word("b", 3.0, 3.2),  # 2.5s gap — long
        _word("c", 3.4, 3.6),  # 0.2s gap — not long
        _word("d", 6.6, 6.8),  # 3.0s gap — long
    ]

    assert total_long_pause_s(words) == 5.5


def test_avg_pause_s_averages_only_positive_gaps() -> None:
    words = [_word("a", 0.0, 1.0), _word("b", 2.0, 3.0), _word("c", 4.0, 5.0)]

    assert avg_pause_s(words) == 1.0


def test_avg_pause_s_returns_none_for_fewer_than_two_words() -> None:
    assert avg_pause_s([]) is None
    assert avg_pause_s([_word("only", 0.0, 0.5)]) is None


def test_assess_rambling_returns_none_within_the_ideal_range() -> None:
    words = [_word(f"w{i}", i * 0.4, i * 0.4 + 0.3) for i in range(200)]
    assert assess_rambling(words, duration_s=90.0, answer_cap_s=120) is None


def test_assess_rambling_returns_none_within_the_grace_window() -> None:
    words = [_word(f"w{i}", i * 0.4, i * 0.4 + 0.3) for i in range(300)]
    assert assess_rambling(words, duration_s=140.0, answer_cap_s=120) is None


def test_assess_rambling_flags_a_long_sparse_answer() -> None:
    # Well past the grace window, and few words for the duration (low WPM) — dead air, not a
    # dense substantive answer.
    words = [_word(f"w{i}", i * 5.0, i * 5.0 + 0.3) for i in range(20)]
    assert assess_rambling(words, duration_s=200.0, answer_cap_s=120) == "rambling"


def test_assess_rambling_does_not_flag_a_long_dense_non_repetitive_answer() -> None:
    # Well past the grace window, but dense (high WPM) and non-repetitive — a real, substantive
    # long answer, not padding. The old duration-only heuristic would have flagged this.
    words = [_word(f"word{i}", i * 0.3, i * 0.3 + 0.25) for i in range(500)]
    duration_s = 155.0
    assert duration_s > 120 + 30
    assert assess_rambling(words, duration_s=duration_s, answer_cap_s=120) is None


def test_assess_rambling_flags_a_long_repetitive_answer_even_if_dense() -> None:
    # High word count (high WPM) but every word is an immediate repeat of the last — padded,
    # not substantive, despite the raw word count looking dense.
    words = [_word("the", i * 0.25, i * 0.25 + 0.2) for i in range(700)]
    duration_s = 700 * 0.25
    assert duration_s > 150
    assert assess_rambling(words, duration_s=duration_s, answer_cap_s=120) == "rambling"


def test_assess_rambling_gives_technical_questions_more_duration_allowance() -> None:
    # A duration that would be flagged for a behavioral question is tolerated for a technical
    # one (a real deep-dive legitimately runs longer), as long as it's still sparse/low-density
    # relative to *that* wider allowance.
    words = [_word(f"w{i}", i * 0.4, i * 0.4 + 0.3) for i in range(50)]
    duration_s = 170.0  # > 120+30 (behavioral would flag) but < (120*1.2)+30 (technical allows)
    behavioral = assess_rambling(
        words, duration_s=duration_s, answer_cap_s=120, category=Category.BEHAVIORAL
    )
    technical = assess_rambling(
        words, duration_s=duration_s, answer_cap_s=120, category=Category.TECHNICAL
    )
    assert behavioral == "rambling"
    assert technical is None


def test_assess_rambling_scales_with_the_configured_answer_cap() -> None:
    # A session configured with a generous 5-minute cap shouldn't flag an answer that's well
    # within it, even though it exceeds the fixed 120s+30s default.
    words = [_word(f"word{i}", i * 0.3, i * 0.3 + 0.25) for i in range(700)]
    duration_s = 700 * 0.3
    assert assess_rambling(words, duration_s=duration_s, answer_cap_s=300) is None


def test_build_transcript_parts_marks_definite_fillers_only() -> None:
    words = [
        _word("So", 0.0, 0.2),
        _word("um,", 0.3, 0.5),
        _word("basically", 0.6, 1.0),
        _word("I", 1.1, 1.2),
    ]

    parts = build_transcript_parts(words)

    assert [(p.type, p.text) for p in parts] == [
        ("text", "So "),
        ("filler", "um, "),
        ("text", "basically "),
        ("text", "I"),
    ]


def test_build_transcript_parts_strips_punctuation_before_matching() -> None:
    # "um," must still match the filler list even though the raw token has a trailing comma —
    # Whisper attaches punctuation to word tokens.
    words = [_word("um,", 0.0, 0.2)]

    assert build_transcript_parts(words)[0].type == "filler"


def test_build_transcript_parts_inserts_a_pause_part_for_a_long_gap() -> None:
    words = [_word("I", 0.0, 0.2), _word("paused", 3.0, 3.5)]

    parts = build_transcript_parts(words)

    assert [(p.type, p.seconds) for p in parts] == [
        ("text", None),
        ("pause", 2.8),
        ("text", None),
    ]


def test_build_transcript_parts_no_pause_for_a_short_gap() -> None:
    words = [_word("I", 0.0, 0.2), _word("continued", 0.5, 0.8)]

    parts = build_transcript_parts(words)

    assert [p.type for p in parts] == ["text", "text"]


def test_build_transcript_parts_returns_empty_list_for_no_words() -> None:
    assert build_transcript_parts([]) == []


def test_build_transcript_parts_last_word_has_no_trailing_space() -> None:
    words = [_word("done", 0.0, 0.2)]

    assert build_transcript_parts(words)[0].text == "done"


def test_assess_confidence_returns_none_for_a_clean_transcript() -> None:
    assert assess_confidence(filler_count=0, word_count=100) is None


def test_assess_confidence_returns_none_below_the_minimum_count() -> None:
    # A 100% filler rate, but only 2 fillers total — too small a sample to call it a pattern.
    assert assess_confidence(filler_count=2, word_count=2) is None


def test_assess_confidence_returns_none_below_the_rate_threshold() -> None:
    # 3 fillers over 100 words is a 3% rate — under the 8% threshold, even though the count
    # alone clears CONFIDENCE_MIN_FILLER_COUNT.
    assert assess_confidence(filler_count=3, word_count=100) is None


def test_assess_confidence_flags_a_high_filler_rate() -> None:
    note = assess_confidence(filler_count=5, word_count=20)

    assert note is not None
    assert "confident" in note


def test_assess_confidence_boundary_is_strictly_greater_than() -> None:
    # Exactly 8% must not trip it; just over must.
    assert assess_confidence(filler_count=8, word_count=100) is None
    assert assess_confidence(filler_count=9, word_count=100) is not None


def test_assess_confidence_returns_none_for_a_zero_word_transcript() -> None:
    assert assess_confidence(filler_count=0, word_count=0) is None


def test_assess_transcription_quality_returns_none_when_signals_are_absent() -> None:
    assert assess_transcription_quality(None, None) is None


def test_assess_transcription_quality_flags_a_low_confidence_transcript() -> None:
    assert assess_transcription_quality(-1.5, None) is not None


def test_assess_transcription_quality_flags_likely_silence() -> None:
    assert assess_transcription_quality(None, 0.7) is not None


def test_assess_transcription_quality_returns_none_for_healthy_signals() -> None:
    assert assess_transcription_quality(-0.2, 0.05) is None

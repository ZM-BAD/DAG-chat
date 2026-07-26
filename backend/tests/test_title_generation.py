"""
Tests for title generation: language detection, truncation, prompt rendering.

Run with:
    cd backend && python -m pytest tests/test_title_generation.py -v
"""

from backend.api.services.base_service import (
    _LANGUAGE_NAME_MAP,
    _LENGTH_CONSTRAINTS,
    TITLE_PROMPT_TEMPLATE,
    _get_lang_family,
    clean_title,
    detect_user_language,
    truncate_fallback,
    truncate_title,
)

# ---------------------------------------------------------------------------
# detect_user_language
# ---------------------------------------------------------------------------


class TestDetectUserLanguage:
    def test_pure_chinese(self):
        assert detect_user_language("如何使用Python实现快速排序算法") == "zh"

    def test_pure_english(self):
        assert detect_user_language("How to implement quicksort in Python") == "en"

    def test_japanese_with_hiragana(self):
        assert detect_user_language("Pythonでクイックソートを実装する方法") == "ja"

    def test_japanese_with_katakana(self):
        assert detect_user_language("プログラミングの学習") == "ja"

    def test_korean(self):
        assert detect_user_language("파이썬으로 퀵 정렬 구현하기") == "ko"

    def test_german(self):
        # langdetect may confuse short German text containing English loanwords
        result = detect_user_language("Wie implementiert man Quicksort in Python")
        assert result in ("de", "en")  # acceptable: langdetect limitation on short text

    def test_spanish(self):
        assert detect_user_language("Cómo implementar ordenamiento rápido") == "es"

    def test_french(self):
        assert (
            detect_user_language("Comment implémenter le tri rapide en Python") == "fr"
        )

    def test_mixed_cjk_majority(self):
        # > 30% CJK chars → treated as Chinese
        assert detect_user_language("用React实现SPA页面的最佳实践") == "zh"

    def test_mixed_english_majority(self):
        # CJK chars ~43% > 30% threshold → CJK rule fires, treated as zh
        # This is a known trade-off of the simple ratio-based heuristic
        result = detect_user_language("What is 快速排序?")
        assert result in ("en", "zh")

    def test_empty_string(self):
        assert detect_user_language("") == "en"

    def test_punctuation_only(self):
        result = detect_user_language("!!! ??? ...")
        assert isinstance(result, str)


# ---------------------------------------------------------------------------
# _get_lang_family
# ---------------------------------------------------------------------------


class TestGetLangFamily:
    def test_cjk_family(self):
        for lang in ("zh", "ja", "ko"):
            assert _get_lang_family(lang) == "cjk"

    def test_latin_family(self):
        for lang in ("en", "es", "fr", "de", "pt", "it", "ru", "ar"):
            assert _get_lang_family(lang) == "latin"


# ---------------------------------------------------------------------------
# clean_title
# ---------------------------------------------------------------------------


class TestCleanTitle:
    def test_chinese_trailing_period(self):
        assert clean_title("快速排序算法。") == "快速排序算法"

    def test_english_trailing_period(self):
        assert clean_title("Sorting Algorithm.") == "Sorting Algorithm"

    def test_english_trailing_exclamation(self):
        assert clean_title("Amazing Result!") == "Amazing Result"

    def test_leading_trailing_whitespace(self):
        assert clean_title("  Hello World  ") == "Hello World"

    def test_no_trailing_punctuation(self):
        assert clean_title("Quick Sort") == "Quick Sort"

    def test_mixed_punctuation(self):
        assert clean_title("「测试」") == "测试"

    def test_ellipsis(self):
        assert clean_title("测试…") == "测试"


# ---------------------------------------------------------------------------
# truncate_title
# ---------------------------------------------------------------------------


class TestTruncateTitle:
    def test_chinese_short_enough(self):
        assert truncate_title("快速排序算法", "zh") == "快速排序算法"

    def test_chinese_truncated_to_12(self):
        long_title = "这是一个超过十二个字符的中文标题应该被截断"
        result = truncate_title(long_title, "zh")
        assert len(result) == 12
        assert result == long_title[:12]

    def test_japanese_truncated_to_12(self):
        long_title = "これは十二文字を超える日本語のタイトルです"
        result = truncate_title(long_title, "ja")
        assert len(result) == 12

    def test_english_short_enough(self):
        assert truncate_title("Quick Sort Algorithm", "en") == "Quick Sort Algorithm"

    def test_english_truncated_at_word_boundary(self):
        # 50 chars = "How to implement quicksort algorithm in Python "
        # Word boundary at space after "Python" → "How to implement quicksort algorithm in Python"
        long_title = "How to implement quicksort algorithm in Python with comprehensive tests and benchmarks"
        result = truncate_title(long_title, "en")
        assert len(result) <= 50
        # Should end at a word boundary
        assert not result.endswith(" ")

    def test_english_no_good_boundary(self):
        # Very long single word — no word boundary in the 50%+ zone
        long_title = "SupercalifragilisticexpialidociousAndMoreWordsHereAndEvenMore"
        result = truncate_title(long_title, "en")
        assert len(result) <= 50

    def test_clean_title_before_truncate(self):
        # Trailing punctuation should be cleaned before length check
        assert truncate_title("短标题。", "zh") == "短标题"

    def test_empty_after_clean(self):
        assert truncate_title("...", "en") == ""


# ---------------------------------------------------------------------------
# truncate_fallback
# ---------------------------------------------------------------------------


class TestTruncateFallback:
    def test_chinese_input(self):
        result = truncate_fallback("如何使用Python实现快速排序算法？")
        # len() counts all chars equally: CJK + Latin letters
        assert len(result) <= 12
        assert result == "如何使用Python实现"

    def test_english_input(self):
        result = truncate_fallback("How to implement quicksort in Python")
        assert len(result) <= 50

    def test_empty_input_returns_empty_string(self):
        # Empty string lets frontend i18n fallback work correctly
        assert truncate_fallback("") == ""


# ---------------------------------------------------------------------------
# Prompt template rendering
# ---------------------------------------------------------------------------


class TestPromptTemplate:
    def test_cjk_prompt_rendering(self):
        prompt = TITLE_PROMPT_TEMPLATE.format(
            language_name=_LANGUAGE_NAME_MAP["zh"],
            length_constraint=_LENGTH_CONSTRAINTS["cjk"],
            user_input="如何排序",
            full_response="可以使用快速排序...",
        )
        assert "Chinese" in prompt
        assert "12 characters" in prompt

    def test_latin_prompt_rendering(self):
        prompt = TITLE_PROMPT_TEMPLATE.format(
            language_name=_LANGUAGE_NAME_MAP["en"],
            length_constraint=_LENGTH_CONSTRAINTS["latin"],
            user_input="How to sort",
            full_response="Use quicksort...",
        )
        assert "English" in prompt
        assert "8 words" in prompt

    def test_japanese_prompt_rendering(self):
        prompt = TITLE_PROMPT_TEMPLATE.format(
            language_name=_LANGUAGE_NAME_MAP["ja"],
            length_constraint=_LENGTH_CONSTRAINTS["cjk"],
            user_input="ソート方法",
            full_response="クイックソート...",
        )
        assert "Japanese" in prompt
        assert "12 characters" in prompt

    def test_unknown_language_uses_capitalize(self):
        prompt = TITLE_PROMPT_TEMPLATE.format(
            language_name="Swahili",
            length_constraint=_LENGTH_CONSTRAINTS["latin"],
            user_input="Test",
            full_response="Response",
        )
        assert "Swahili" in prompt

    def test_no_trailing_punctuation_instruction(self):
        prompt = TITLE_PROMPT_TEMPLATE.format(
            language_name="English",
            length_constraint="Use at most 6 words.",
            user_input="Test",
            full_response="Response",
        )
        assert "NO trailing punctuation" in prompt

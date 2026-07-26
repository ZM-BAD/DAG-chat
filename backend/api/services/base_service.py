import abc
import logging
import re
import string

from langdetect import LangDetectException, detect

from backend.api.utils import try_or

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Language detection
# ---------------------------------------------------------------------------

_LANGUAGE_NAME_MAP: dict[str, str] = {
    "zh": "Chinese",
    "ja": "Japanese",
    "ko": "Korean",
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "ru": "Russian",
    "ar": "Arabic",
    "pt": "Portuguese",
    "it": "Italian",
    "nl": "Dutch",
    "pl": "Polish",
    "tr": "Turkish",
    "vi": "Vietnamese",
    "th": "Thai",
    "id": "Indonesian",
}

_LENGTH_CONSTRAINTS = {
    "cjk": "Use at most 12 characters.",
    "latin": "Use at most 8 words or 50 characters.",
}

_REASONING_MODEL_PATTERNS = re.compile(r"(-thinking|-reasoner|-r1\b)", re.IGNORECASE)

PUNCTUATION_LATIN = string.punctuation
PUNCTUATION_CJK = "。、！？；：「」『』【】《》〈〉·～…，（）“”‘’"

TITLE_PROMPT_TEMPLATE = (
    "Generate a concise title for the following conversation. "
    "The title MUST be in {language_name}. "
    "{length_constraint} "
    "Return ONLY the title text with NO trailing punctuation.\n"
    "User: {user_input}\nAI: {full_response}"
)

_MAX_RESPONSE_CHARS_IN_PROMPT = 500


def detect_user_language(text: str) -> str:
    """Return ISO 639-1 code for the user's input language."""
    if not text:
        return "en"

    sample = text[:200]

    # Unicode range pre-check (reliable for CJK family)
    has_hiragana = any("぀" <= ch <= "ゟ" for ch in sample)
    has_katakana = any("゠" <= ch <= "ヿ" for ch in sample)
    if has_hiragana or has_katakana:
        return "ja"

    has_hangul = any("가" <= ch <= "힯" for ch in sample)
    if has_hangul:
        return "ko"

    # Mixed language: CJK chars > 30% → treat as Chinese
    cjk_chars = sum(
        1
        for ch in sample
        if "一" <= ch <= "鿿" or "㐀" <= ch <= "䶿" or "豈" <= ch <= "﫿"
    )
    if cjk_chars / max(len(sample), 1) > 0.3:
        return "zh"

    # langdetect fallback for Latin / other language families
    try:
        lang = detect(sample)
        if lang.startswith("zh"):
            return "zh"
        return lang
    except LangDetectException:
        return "en"


def _get_lang_family(lang: str) -> str:
    if lang in ("zh", "ja", "ko"):
        return "cjk"
    return "latin"


def clean_title(title: str) -> str:
    """Strip leading/trailing punctuation and whitespace."""
    return title.strip(" \n\r\t" + PUNCTUATION_LATIN + PUNCTUATION_CJK)


def truncate_title(title: str, lang: str) -> str:
    """Truncate title according to language-family rules."""
    title = clean_title(title)
    if not title:
        return title

    family = _get_lang_family(lang)

    if family == "cjk":
        max_chars = 12
        if len(title) > max_chars:
            logger.warning(
                "CJK title exceeds %d chars and was truncated: %s (%d chars)",
                max_chars,
                title,
                len(title),
            )
            return title[:max_chars]
        return title

    # Latin / RTL / Cyrillic / other
    max_chars = 50
    if len(title) <= max_chars:
        return title

    truncated = title[:max_chars]

    # Find last word boundary
    best_boundary = -1
    for sep in (" ", "-", "—", "–", "/", "|"):
        idx = truncated.rfind(sep)
        best_boundary = max(best_boundary, idx)

    # Only cut at word boundary if it preserves >= 50% content
    if best_boundary >= max_chars * 0.5:
        return truncated[:best_boundary]

    return truncated


def truncate_fallback(user_input: str) -> str:
    """Fallback title from user input, language-aware truncation.

    Returns empty string for empty input so frontend i18n fallback works.
    """
    if not user_input:
        return ""
    lang = detect_user_language(user_input)
    return truncate_title(user_input, lang)


def _build_title_prompt(
    user_input: str, full_response: str
) -> tuple[str, str, list[dict]]:
    """Build prompt messages for title generation. Returns (lang, language_name, messages)."""
    lang = detect_user_language(user_input)
    lang_family = _get_lang_family(lang)
    language_name = _LANGUAGE_NAME_MAP.get(lang, lang.capitalize())
    length_constraint = _LENGTH_CONSTRAINTS[lang_family]

    response_preview = (
        full_response[:_MAX_RESPONSE_CHARS_IN_PROMPT]
        if len(full_response) > _MAX_RESPONSE_CHARS_IN_PROMPT
        else full_response
    )

    messages = [
        {
            "role": "user",
            "content": TITLE_PROMPT_TEMPLATE.format(
                language_name=language_name,
                length_constraint=length_constraint,
                user_input=user_input,
                full_response=response_preview,
            ),
        }
    ]
    return lang, language_name, messages


# ---------------------------------------------------------------------------
# Base model service
# ---------------------------------------------------------------------------


class BaseModelService(metaclass=abc.ABCMeta):
    """
    Base class for model services, defines the interface all model services must implement
    """

    # Title generation should disable thinking mode; override to False if
    # the model cannot disable reasoning (e.g. MiniMax M2).
    _title_disable_thinking: bool = True

    # Token budget for title generation — raised from 20 to 40 to accommodate
    # 6-word English titles while leaving headroom.
    _title_max_tokens: int = 40

    # Subclasses set this to pass provider-specific params (e.g. disable thinking)
    _title_extra_params: dict | None = None

    @abc.abstractmethod
    async def generate(self, messages, deep_thinking: bool = False):
        """
        Generate streaming response

        Args:
            messages: List of message history, each message contains role and content fields
            deep_thinking: Whether to use thinking model

        Returns:
            Async generator containing content and reasoning fields
        """

    @abc.abstractmethod
    def _get_title_model(self) -> str:
        """
        Return the model name used for title generation

        Subclasses must implement this method, returning the corresponding model identifier
        """

    def generate_title(self, user_input: str, full_response: str) -> str:
        """
        Generate conversation title from user input and full response.

        Flow: language detection → localized prompt → LLM call → clean + truncate.
        Fallback: language-aware truncation of user_input.
        """
        service_name = self.get_service_name()
        lang, _language_name, messages = _build_title_prompt(user_input, full_response)

        # Check for reasoning model misconfiguration
        title_model = self._get_title_model()
        if self._title_disable_thinking and _REASONING_MODEL_PATTERNS.search(
            title_model
        ):
            logger.warning(
                "%s title model '%s' appears to be a reasoning model, "
                "but thinking cannot be disabled. Consider using a non-reasoning model.",
                service_name,
                title_model,
            )

        def _generate():
            kwargs = {
                "model": title_model,
                "messages": messages,
                "temperature": 0.3,
                "max_tokens": self._title_max_tokens,
            }
            if self._title_extra_params:
                kwargs["extra_body"] = self._title_extra_params

            response = self.client.chat.completions.create(**kwargs)

            content = response.choices[0].message.content
            if content:
                title = truncate_title(content, lang)
                if title:
                    return title

            # LLM returned empty content
            logger.warning(
                "%s title generation returned empty content, using fallback",
                service_name,
            )
            return None

        result = try_or(_generate, None, f"{service_name}_title")
        if result:
            return result
        return truncate_fallback(user_input)

    @classmethod
    def get_service_name(cls) -> str:
        """
        Get service name, used for identification in the factory
        """
        return cls.__name__.lower().replace("service", "")

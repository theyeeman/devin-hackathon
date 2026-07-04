import os
import pytest

os.environ.setdefault("BRIGHT_DATA_API_KEY", "test-key")
os.environ.setdefault("OPENROUTER_API_KEY", "test-key")

from services.llm import LLMService


class _FakeChat:
    def __init__(self):
        self.completions = None


def _make_completions(content):
    """Build a stub that mimics client.chat.completions with a create() method
    returning an OpenAI-style chat completion response.
    """

    class _Message:
        def __init__(self, text):
            self.content = text

    class _Choice:
        def __init__(self, text):
            self.message = _Message(text)

    class _Response:
        def __init__(self, text):
            self.choices = [_Choice(text)]

    class _Completions:
        def create(self, **kwargs):
            return _Response(content)

    return _Completions()


class _FakeClient:
    """A stub OpenAI client that allows attribute assignment in tests."""

    def __init__(self, api_key=None, base_url=None):
        self.chat = _FakeChat()


@pytest.fixture
def service(monkeypatch):
    # Avoid constructing a real OpenAI client during __init__
    monkeypatch.setattr("services.llm.OpenAI", _FakeClient)
    return LLMService()


def test_missing_openrouter_key(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with pytest.raises(RuntimeError):
        LLMService()


def test_extract_first_name(service):
    assert service._extract_first_name({"name": "John Smith"}) == "John"
    assert service._extract_first_name({"name": ""}) == "there"
    assert service._extract_first_name({}) == "there"


def test_parse_llm_response_plain_json(service):
    text = '{"comments": ["Hi John.. lol"], "topic_summary": "stuff"}'
    result = service._parse_llm_response(text)
    assert result["comments"] == ["Hi John.. lol"]
    assert result["topic_summary"] == "stuff"


def test_parse_llm_response_with_code_fence(service):
    text = '```json\n{"comments": ["Hi Jane.. ok"], "topic_summary": "x"}\n```'
    result = service._parse_llm_response(text)
    assert result["comments"] == ["Hi Jane.. ok"]


def test_parse_llm_response_with_surrounding_text(service):
    text = 'Here you go:\n{"comments": ["Hi Bob.. hey"], "topic_summary": "y"} \nDone.'
    result = service._parse_llm_response(text)
    assert result["comments"] == ["Hi Bob.. hey"]


@pytest.mark.asyncio
async def test_generate_troll_comments_full_pipeline(service, monkeypatch):
    async def fake_scrape(url):
        return {"name": "Elon Musk", "position": "CEO at Tesla"}

    monkeypatch.setattr(service.bright_data, "scrape_linkedin_profile", fake_scrape)

    content = (
        '{"comments": ['
        '"Hi Elon.. sure buddy.", '
        '"Hi Elon.. nice rocket.", '
        '"Hi Elon.. wow, groundbreaking.", '
        '"Hi Elon.. LinkedIn genius alert."'
        '], "topic_summary": "The topic is overhyped."}'
    )
    service.client.chat.completions = _make_completions(content)

    result = await service.generate_troll_comments(
        post_content="I just revolutionized the world with AI!",
        profile_url="https://linkedin.com/in/elonmusk",
    )
    assert result["profile_name"] == "Elon Musk"
    assert len(result["comments"]) == 4
    assert all(c.startswith("Hi Elon..") for c in result["comments"])
    assert result["topic_summary"] == "The topic is overhyped."


@pytest.mark.asyncio
async def test_generate_troll_comments_bad_json_fallback(service, monkeypatch):
    async def fake_scrape(url):
        return {"name": "Jane Doe"}

    monkeypatch.setattr(service.bright_data, "scrape_linkedin_profile", fake_scrape)

    service.client.chat.completions = _make_completions("totally not json")

    result = await service.generate_troll_comments(
        post_content="hello world",
        profile_url="https://linkedin.com/in/janedoe",
    )
    assert result["profile_name"] == "Jane Doe"
    assert result["comments"] == ["totally not json"]

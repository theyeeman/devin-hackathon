import os
import pytest

os.environ.setdefault("BRIGHT_DATA_API_KEY", "test-key")
os.environ.setdefault("OPENAI_API_KEY", "test-key")

from services.llm import LLMService


class _FakeClient:
    """A stub OpenAI client that allows attribute assignment in tests."""

    def __init__(self, api_key=None):
        self.responses = None


@pytest.fixture
def service(monkeypatch):
    # Avoid constructing a real OpenAI client during __init__
    monkeypatch.setattr("services.llm.OpenAI", _FakeClient)
    return LLMService()


def test_missing_openai_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
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

    class FakeResponse:
        output_text = (
            '{"comments": ['
            '"Hi Elon.. sure buddy.", '
            '"Hi Elon.. nice rocket.", '
            '"Hi Elon.. wow, groundbreaking.", '
            '"Hi Elon.. LinkedIn genius alert."'
            '], "topic_summary": "The topic is overhyped."}'
        )

    class FakeResponses:
        def create(self, **kwargs):
            return FakeResponse()

    service.client.responses = FakeResponses()

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

    class FakeResponse:
        output_text = "totally not json"

    class FakeResponses:
        def create(self, **kwargs):
            return FakeResponse()

    service.client.responses = FakeResponses()

    result = await service.generate_troll_comments(
        post_content="hello world",
        profile_url="https://linkedin.com/in/janedoe",
    )
    assert result["profile_name"] == "Jane Doe"
    assert result["comments"] == ["totally not json"]

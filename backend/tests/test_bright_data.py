import os
import pytest

os.environ.setdefault("BRIGHT_DATA_API_KEY", "test-key")

from services.bright_data import BrightDataService


@pytest.fixture
def service():
    return BrightDataService()


def test_missing_api_key(monkeypatch):
    monkeypatch.delenv("BRIGHT_DATA_API_KEY", raising=False)
    with pytest.raises(RuntimeError):
        BrightDataService()


def test_extract_profile_summary_full(service):
    profile = {
        "name": "Satya Nadella",
        "position": "Chairman and CEO at Microsoft",
        "current_company": {"name": "Microsoft"},
        "city": "Redmond",
        "country_code": "US",
        "followers": 10842560,
        "connections": 500,
        "about": "Passionate about empowering people.",
        "skills": ["Leadership", "Cloud Computing", {"name": "Strategy"}],
        "experience": [
            {"title": "CEO", "company": {"name": "Microsoft"}, "duration": "10 yrs"},
        ],
        "education": [
            {"degree": "MS", "school": "University of Wisconsin"},
        ],
    }
    summary = service.extract_profile_summary(profile)
    assert "Satya Nadella" in summary
    assert "Chairman and CEO at Microsoft" in summary
    assert "Microsoft" in summary
    assert "Redmond" in summary
    assert "Leadership" in summary
    assert "Strategy" in summary
    assert "University of Wisconsin" in summary


def test_extract_profile_summary_empty(service):
    assert service.extract_profile_summary({}) == "No profile data available."


@pytest.mark.asyncio
async def test_scrape_linkedin_profile_returns_first_record(service, monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [{"name": "Jane Doe", "position": "CTO"}]

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, *args, **kwargs):
            return FakeResponse()

    monkeypatch.setattr("services.bright_data.httpx.AsyncClient", FakeClient)
    result = await service.scrape_linkedin_profile("https://linkedin.com/in/janedoe")
    assert result == {"name": "Jane Doe", "position": "CTO"}


@pytest.mark.asyncio
async def test_scrape_linkedin_profile_empty_response(service, monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return []

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, *args, **kwargs):
            return FakeResponse()

    monkeypatch.setattr("services.bright_data.httpx.AsyncClient", FakeClient)
    result = await service.scrape_linkedin_profile("https://linkedin.com/in/nobody")
    assert result == {}

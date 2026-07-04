import os
import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("BRIGHT_DATA_API_KEY", "test-key")
os.environ.setdefault("OPENAI_API_KEY", "test-key")

import main
from main import app

client = TestClient(app)


def test_root():
    resp = client.get("/")
    assert resp.status_code == 200
    assert "running" in resp.json()["message"].lower()


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_generate_comments_success(monkeypatch):
    class FakeLLMService:
        async def generate_troll_comments(self, post_content, profile_url):
            return {
                "comments": [
                    "Hi John.. bold claim.",
                    "Hi John.. sure thing.",
                    "Hi John.. groundbreaking, truly.",
                    "Hi John.. LinkedIn lunatic.",
                ],
                "profile_name": "John Doe",
                "topic_summary": "Overhyped post.",
            }

    monkeypatch.setattr(main, "LLMService", lambda: FakeLLMService())

    resp = client.post(
        "/generate-comments",
        json={"content": "I changed the world!", "user": "https://linkedin.com/in/johndoe"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["profile_name"] == "John Doe"
    assert len(body["comments"]) == 4
    assert body["comments"][0]["comment"].startswith("Hi John..")


def test_generate_comments_validation_error():
    resp = client.post("/generate-comments", json={"content": "missing user"})
    assert resp.status_code == 422


def test_generate_comments_empty_result(monkeypatch):
    class FakeLLMService:
        async def generate_troll_comments(self, post_content, profile_url):
            return {"comments": [], "profile_name": "X", "topic_summary": ""}

    monkeypatch.setattr(main, "LLMService", lambda: FakeLLMService())

    resp = client.post(
        "/generate-comments",
        json={"content": "hi", "user": "https://linkedin.com/in/x"},
    )
    assert resp.status_code == 500


def test_generate_comments_upstream_failure(monkeypatch):
    class FakeLLMService:
        async def generate_troll_comments(self, post_content, profile_url):
            raise Exception("Bright Data down")

    monkeypatch.setattr(main, "LLMService", lambda: FakeLLMService())

    resp = client.post(
        "/generate-comments",
        json={"content": "hi", "user": "https://linkedin.com/in/x"},
    )
    assert resp.status_code == 502

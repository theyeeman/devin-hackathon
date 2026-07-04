# devin-hackathon
Devin hackathon

## Project Structure

```
devin-hackathon/
├── chrome-extension/   # Chrome extension (frontend)
├── backend/            # FastAPI backend (troll comment generator)
│   ├── main.py         # FastAPI app with /generate-comments endpoint
│   ├── models.py       # Pydantic request/response models
│   ├── services/
│   │   ├── bright_data.py  # Bright Data API client for LinkedIn profile scraping
│   │   └── llm.py          # OpenRouter LLM service with web search for troll generation
│   ├── requirements.txt
│   └── .env.example
└── README.md
```

## How to install (Chrome Extension)

1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `chrome-extension` folder

## Backend Setup

### Prerequisites

- Python 3.10+
- A [Bright Data](https://brightdata.com/) account with an API key (for LinkedIn profile scraping)
- An [OpenRouter](https://openrouter.ai/) API key

### Installation

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your API keys
```

### Environment Variables

| Variable | Description |
| --- | --- |
| `BRIGHT_DATA_API_KEY` | Your Bright Data API token |
| `OPENROUTER_API_KEY` | Your OpenRouter API key |
| `OPENROUTER_MODEL` | Model slug to use (default `openai/gpt-4o`) |

### Running the server

```bash
cd backend
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.

### API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/` | Health check |
| `GET` | `/health` | Health check |
| `POST` | `/generate-comments` | Generate trolling comments |

### POST `/generate-comments`

**Request:**
```json
{
  "content": "Just shipped a groundbreaking AI product that will change the world! 🚀 #AI #Innovation",
  "user": "https://www.linkedin.com/in/someuser"
}
```

**Response:**
```json
{
  "comments": [
    {"comment": "Hi John.. I see you 'shipped a groundbreaking AI product' — wasn't that just a wrapper around GPT-4? Groundbreaking indeed."},
    {"comment": "Hi John.. 3 rocket emojis and 2 buzzwords in one post — your LinkedIn influencer certification is showing."},
    {"comment": "Hi John.. You posted about changing the world but your company has 12 employees and no revenue. Bold strategy."},
    {"comment": "Hi John.. I love how 'shipped' means you deployed a landing page. The bar for groundbreaking is truly underground."}
  ],
  "profile_name": "John Doe",
  "topic_summary": "The post claims a groundbreaking AI product launch, but the company appears to be a small startup with limited track record."
}
```

### How it works

1. The Chrome extension sends the LinkedIn post content and the poster's profile URL to the backend.
2. The backend uses **Bright Data's LinkedIn Scraper API** to scrape the poster's full profile (work history, education, skills, etc.).
3. The backend sends the post content + profile info to an LLM via **OpenRouter** (default `openai/gpt-4o`) with the **web search server tool** enabled.
4. The LLM searches the web for ground truths about the post's topic and the person's claims.
5. Using both the profile data and web search results, the LLM identifies "weak spots" and generates 4 snarky trolling comments.
6. Each comment starts with `"Hi <first name>.."` and targets a different angle.
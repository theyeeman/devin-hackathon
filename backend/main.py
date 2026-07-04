import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import TrollRequest, TrollResponse, TrollComment
from services.llm import LLMService

load_dotenv()

app = FastAPI(
    title="LinkedIn Troll Generator API",
    description="Takes scraped LinkedIn post data and generates snarky trolling comments.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "LinkedIn Troll Generator API is running"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/generate-comments", response_model=TrollResponse)
async def generate_comments(request: TrollRequest):
    """Generate 4 snarky trolling comments for a LinkedIn post.

    Request body:
    - content: The text content of the LinkedIn post
    - user: The LinkedIn profile URL of the poster
    """
    try:
        llm_service = LLMService()
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    try:
        result = await llm_service.generate_troll_comments(
            post_content=request.content,
            profile_url=request.user,
            troll_level=request.troll_level,
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to generate comments: {str(e)}",
        )

    comments = [TrollComment(comment=c) for c in result.get("comments", [])]

    if not comments:
        raise HTTPException(
            status_code=500,
            detail="No comments were generated",
        )

    return TrollResponse(
        comments=comments,
        profile_name=result.get("profile_name", "Unknown"),
        topic_summary=result.get("topic_summary", ""),
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8000)),
        reload=True,
    )

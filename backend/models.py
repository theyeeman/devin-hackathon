from pydantic import BaseModel, Field


class TrollRequest(BaseModel):
    content: str = Field(..., description="The text content of the LinkedIn post")
    user: str = Field(..., description="The LinkedIn profile URL of the poster")
    troll_level: str = Field(default="normal", description="The troll level: 'normal' or 'spicy'")


class TrollComment(BaseModel):
    comment: str = Field(..., description="A snarky trolling comment")


class TrollResponse(BaseModel):
    comments: list[TrollComment] = Field(..., description="List of 4 trolling comments")
    profile_name: str = Field(..., description="Name of the LinkedIn user")
    topic_summary: str = Field(..., description="Brief summary of what was found about the topic")

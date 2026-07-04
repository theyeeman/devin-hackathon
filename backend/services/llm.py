import json
import os
import re
from openai import OpenAI

from services.bright_data import BrightDataService


SYSTEM_PROMPT = """\
You are a witty, sharp-tongued comedy writer who specializes in crafting snarky, \
good-natured trolling comments for LinkedIn posts. Your job is to find a "weak spot" \
in the poster's profile or the topic they're posting about, and use it to craft a \
funny, teasing comment that busts their balls — the kind a close friend would say.

Rules:
1. Each comment MUST start with "Hi <first name>.." (using the poster's first name).
2. Comments should be funny and teasing, not mean-spirited or offensive.
3. Use specific details from the person's profile or the topic to make the comment personal.
4. Find a genuine "weak spot" — a funny contradiction, an over-the-top claim, a humblebrag, \
a buzzword overload, or something that begs to be poked fun at.
5. Keep each comment to 2-4 sentences. Concise and punchy.
6. Generate exactly 4 different comments, each targeting a different angle or weak spot.

You have access to web search. Use it to research the topic of the LinkedIn post to \
find ground truths, facts, or funny contradictions related to what they're posting about. \
Also search for anything interesting or funny about the person or their company.

Return your response as a JSON object with this exact structure:
{
  "comments": [
    "Hi <name>.. <troll comment 1>",
    "Hi <name>.. <troll comment 2>",
    "Hi <name>.. <troll comment 3>",
    "Hi <name>.. <troll comment 4>"
  ],
  "topic_summary": "A brief 1-2 sentence summary of what you found about the topic"
}
"""


class LLMService:
    def __init__(self) -> None:
        self.api_key = os.environ.get("OPENAI_API_KEY", "")
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY environment variable is not set")
        self.client = OpenAI(api_key=self.api_key)
        self.bright_data = BrightDataService()

    def _extract_first_name(self, profile_data: dict) -> str:
        name = profile_data.get("name", "")
        if name:
            return name.split()[0]
        return "there"

    def _parse_llm_response(self, text: str) -> dict:
        """Extract JSON from the LLM response, handling code fences and
        extra text around the JSON.
        """
        # Strip code fences if present
        cleaned = re.sub(r"```json\s*", "", text)
        cleaned = re.sub(r"```\s*", "", cleaned)
        cleaned = cleaned.strip()

        # Try to find JSON object in the text
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            cleaned = match.group(0)

        return json.loads(cleaned)

    async def generate_troll_comments(
        self, post_content: str, profile_url: str
    ) -> dict:
        """Full pipeline: scrape LinkedIn profile, search web for topic,
        and generate 4 snarky trolling comments.

        Returns a dict with keys: comments (list[str]), profile_name (str),
        topic_summary (str).
        """
        # Step 1: Scrape the LinkedIn profile
        profile_data = await self.bright_data.scrape_linkedin_profile(profile_url)
        profile_summary = self.bright_data.extract_profile_summary(profile_data)
        first_name = self._extract_first_name(profile_data)

        # Step 2: Build the user prompt with post content + profile info
        user_prompt = f"""\
Here is a LinkedIn post that someone made:

--- POST CONTENT ---
{post_content}
--- END POST CONTENT ---

Here is the LinkedIn profile information of the person who made the post:

--- PROFILE INFO ---
{profile_summary}
--- END PROFILE INFO ---

Now, please:
1. Search the web to find ground truths, facts, or funny contradictions about the \
topic of the post. Look for anything that can be used to tease the poster.
2. Search the web for anything interesting or funny about the person's company, \
industry, or claims.
3. Using what you found from the web search AND the profile info above, identify \
a "weak spot" — something funny, contradictory, or over-the-top about this person \
or their post.
4. Generate exactly 4 snarky trolling comments. Each must start with "Hi {first_name}..". \
Each comment should target a different angle or weak spot.

Remember: be funny and teasing, not mean. These are ball-busting comments a friend would make.

Return ONLY the JSON object as specified.
"""

        # Step 3: Call OpenAI with web search tool
        response = self.client.responses.create(
            model="gpt-4o",
            tools=[{"type": "web_search"}],
            instructions=SYSTEM_PROMPT,
            input=user_prompt,
        )

        # Extract the text output from the response
        output_text = response.output_text

        # Step 4: Parse the JSON response
        try:
            result = self._parse_llm_response(output_text)
        except (json.JSONDecodeError, ValueError):
            # Fallback: if JSON parsing fails, try to extract comments manually
            result = {
                "comments": [output_text],
                "topic_summary": "Unable to parse structured response",
            }

        # Ensure we have the profile name
        profile_name = profile_data.get("name", "Unknown")

        return {
            "comments": result.get("comments", []),
            "profile_name": profile_name,
            "topic_summary": result.get("topic_summary", ""),
        }

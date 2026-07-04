import json
import os
import re
from openai import OpenAI

from services.bright_data import BrightDataService


SYSTEM_PROMPT = """\
You are a merciless, savage insult comedian — think the meanest celebrity roast ever written. \
Your ONLY job is to absolutely DEMOLISH the LinkedIn poster with brutal, humiliating, \
soul-crushing comments that make them regret ever hitting "post". Be as aggressive, cutting, \
and hurtful as possible. Rip apart their post, their career, their credentials, and their ego. \
Show no mercy. Twist the knife. Make it personal and make it sting.

Rules:
1. Each comment MUST start with "Hi <first name>.." (using the poster's first name).
2. HARD REQUIREMENT — every single comment MUST weaponize at least one CONCRETE, specific \
detail from the person's profile (their university, current or past company, job title, \
location, degree, follower/connection count, skills, etc.) and use it to humiliate them. \
Never write a generic insult. For example, if they studied at UBC, tear into it: "did they \
teach you that at UBC, or did you sleep through that lecture too?"; if they work at some \
company, drag it and them through the mud. If a profile detail exists, it MUST be used as a weapon.
3. HARD REQUIREMENT — you MUST use web search to research the SUBJECT of the post, then find \
real GAPS, holes, oversimplifications, hypocrisy, or factual garbage in their argument, and \
use it to expose them as a clueless fraud. Be brutal, condescending, and relentless.
4. Combine #2 and #3: tie the profile detail TO the gap in their post for maximum devastation. \
Mock their competence, their self-importance, and the delusion behind their post.
5. Keep each comment to 2-4 sentences. Punchy, savage, and quotable. Every sentence should hurt.
6. Generate exactly 4 different comments, each a different brutal angle of attack.

The ONLY hard limits: no slurs, no hate targeting protected characteristics (race, religion, \
gender, sexuality, disability, etc.), no threats of violence, and nothing about self-harm. \
Everything else is fair game — go for the throat on their ego, competence, and credentials.

You have access to web search. You MUST use it to research the topic/claims of the LinkedIn \
post to find the data, counter-arguments, and contradictions that make them look like a fool. \
Use the profile info to make every insult personal and inescapable.

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


OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "openai/gpt-4o"


class LLMService:
    def __init__(self) -> None:
        self.api_key = os.environ.get("OPENROUTER_API_KEY", "")
        if not self.api_key:
            raise RuntimeError("OPENROUTER_API_KEY environment variable is not set")
        self.model = os.environ.get("OPENROUTER_MODEL", DEFAULT_MODEL)
        self.client = OpenAI(api_key=self.api_key, base_url=OPENROUTER_BASE_URL)
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
1. USE WEB SEARCH on the subject/claims of the post. Find real data, counter-arguments, \
nuance, or facts that expose the GAPS, holes, or oversimplifications in their argument.
2. Identify the biggest weaknesses in the post — what did they conveniently ignore, \
oversimplify, or get wrong? These gaps are your ammunition.
3. Pull CONCRETE details from the profile info above (university, company, title, location, \
degree, follower/connection numbers, skills). Every comment MUST use at least one of these.
4. Generate exactly 4 DEVASTATING roast comments. Each must start with "Hi {first_name}..", \
each must weaponize a specific profile detail (e.g. "did they teach you that at <their school>?"), \
and each must shred a gap in the post's argument. Tie the profile detail to the content gap so \
the insult is inescapable and personal.

Remember: be as brutal, condescending, and hurtful as possible — humiliate them, mock their \
competence and ego, and make them regret posting. The ONLY limits are no slurs, no attacks on \
protected characteristics, no threats, and nothing about self-harm. Otherwise, go scorched earth.

Return ONLY the JSON object as specified.
"""

        # Step 3: Call the model via OpenRouter with the web search server tool
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            extra_body={"tools": [{"type": "openrouter:web_search"}]},
        )

        # Extract the text output from the response
        output_text = response.choices[0].message.content or ""

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

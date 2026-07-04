"""Live smoke test that hits the REAL Bright Data + OpenRouter APIs.

Run from the backend directory:
    ./venv/bin/python live_test.py

Requires a populated .env (BRIGHT_DATA_API_KEY, OPENROUTER_API_KEY, OPENROUTER_MODEL).
"""
import asyncio
import json

from dotenv import load_dotenv

load_dotenv()

from services.llm import LLMService

PROFILE_URL = "https://www.linkedin.com/in/nathaniel-groleau/"

POST_CONTENT = """There are almost no “entry-level jobs” left.

We just keep pretending there are.

“Junior developer”
→ 3–5 years of experience

“Entry-level role”
→ already expected to be job-ready

Internships
→ basically unpaid mid-level positions

We didn’t raise standards.
We inflated expectations until entry points collapsed.

And then companies ask:
“Why is it so hard to find talent ?”

Maybe the better question is:
When exactly did you stop allowing people to become talent ?

Because here’s the reality nobody wants to say out loud:

Companies don’t want juniors anymore.
They want finished products.

No training.
No ramp-up.
No investment.

Just plug-and-play employees.

So we built a system where:

You can’t get experience without a job
You can’t get a job without experience
And nobody wants to fix the loop

Then we label it a “talent shortage.”

It’s not a shortage.
It’s gatekeeping dressed up as hiring strategy.

Change my mind.

#hiring #recruitment #softwareengineering #careers #futureofwork #techindustry #leadership"""


async def main():
    service = LLMService()
    print(f"Model: {service.model}")
    print(f"Scraping profile: {PROFILE_URL}\n")

    # Show the scraped profile summary so we can verify what details the LLM used
    profile_data = await service.bright_data.scrape_linkedin_profile(PROFILE_URL)
    print("--- SCRAPED PROFILE SUMMARY ---")
    print(service.bright_data.extract_profile_summary(profile_data))
    print("-------------------------------\n")

    result = await service.generate_troll_comments(
        post_content=POST_CONTENT,
        profile_url=PROFILE_URL,
    )

    print("=" * 70)
    print(f"Profile name : {result['profile_name']}")
    print(f"Topic summary: {result['topic_summary']}")
    print("=" * 70)
    for i, comment in enumerate(result["comments"], 1):
        print(f"\n[{i}] {comment}")
    print()


if __name__ == "__main__":
    asyncio.run(main())

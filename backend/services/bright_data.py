import os
import httpx
from typing import Any

BRIGHT_DATA_API_URL = "https://api.brightdata.com/datasets/v3/scrape"
LINKEDIN_PROFILE_DATASET_ID = "gd_l1viktl72bvl7bjuj0"


class BrightDataService:
    def __init__(self) -> None:
        self.api_key = os.environ.get("BRIGHT_DATA_API_KEY", "")
        if not self.api_key:
            raise RuntimeError("BRIGHT_DATA_API_KEY environment variable is not set")

    async def scrape_linkedin_profile(self, profile_url: str) -> dict[str, Any]:
        """Scrape a LinkedIn profile using Bright Data's synchronous scrape API.

        Returns the first profile record from the response, or an empty dict
        if the response is empty.
        """
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        params = {
            "dataset_id": LINKEDIN_PROFILE_DATASET_ID,
            "format": "json",
        }
        payload = [{"url": profile_url}]

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                BRIGHT_DATA_API_URL,
                headers=headers,
                params=params,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

        if isinstance(data, list) and len(data) > 0:
            return data[0]
        return {}

    def extract_profile_summary(self, profile_data: dict[str, Any]) -> str:
        """Convert raw Bright Data profile JSON into a readable text summary
        that can be fed to the LLM.
        """
        if not profile_data:
            return "No profile data available."

        parts: list[str] = []

        name = profile_data.get("name", "Unknown")
        parts.append(f"Name: {name}")

        position = profile_data.get("position")
        if position:
            parts.append(f"Current Position: {position}")

        current_company = profile_data.get("current_company")
        if isinstance(current_company, dict):
            company_name = current_company.get("name", "")
            if company_name:
                parts.append(f"Current Company: {company_name}")

        city = profile_data.get("city")
        if city:
            parts.append(f"Location: {city}")

        country = profile_data.get("country_code")
        if country:
            parts.append(f"Country: {country}")

        followers = profile_data.get("followers")
        if followers is not None:
            parts.append(f"Followers: {followers}")

        connections = profile_data.get("connections")
        if connections is not None:
            parts.append(f"Connections: {connections}")

        about = profile_data.get("about")
        if about:
            parts.append(f"About: {about}")

        skills = profile_data.get("skills")
        if isinstance(skills, list) and skills:
            skill_names = [
                s if isinstance(s, str) else s.get("name", "") if isinstance(s, dict) else ""
                for s in skills
            ]
            skill_names = [s for s in skill_names if s]
            if skill_names:
                parts.append(f"Skills: {', '.join(skill_names[:15])}")

        experience = profile_data.get("experience")
        if isinstance(experience, list) and experience:
            exp_lines: list[str] = []
            for exp in experience[:5]:
                if isinstance(exp, dict):
                    title = exp.get("title", "")
                    company = exp.get("company", "")
                    if isinstance(company, dict):
                        company = company.get("name", "")
                    duration = exp.get("duration", "")
                    line = f"  - {title} at {company}"
                    if duration:
                        line += f" ({duration})"
                    exp_lines.append(line)
            if exp_lines:
                parts.append("Work Experience:\n" + "\n".join(exp_lines))

        education = profile_data.get("education")
        if isinstance(education, list) and education:
            edu_lines: list[str] = []
            for edu in education[:3]:
                if isinstance(edu, dict):
                    school = edu.get("school", "")
                    degree = edu.get("degree", "")
                    line = f"  - {degree} at {school}"
                    edu_lines.append(line)
            if edu_lines:
                parts.append("Education:\n" + "\n".join(edu_lines))

        return "\n".join(parts)

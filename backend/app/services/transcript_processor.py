"""Transcript processing via OpenAI Responses API.

If no OpenAI API key is configured, callers can fall back to scaffold content.
"""

from __future__ import annotations

import json
from typing import Any

import httpx

from app.config import settings

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"


def transcript_processing_enabled() -> bool:
    return bool(settings.openai_api_key.strip())


def _extract_output_text(payload: dict[str, Any]) -> str:
    output = payload.get("output") or []
    for item in output:
        if item.get("type") != "message":
            continue
        for content in item.get("content") or []:
            if content.get("type") == "output_text":
                return content.get("text") or ""
    return ""


async def process_transcript_to_markdown(
    *,
    transcript_title: str,
    source_label: str | None,
    transcript_text: str,
    extraction_targets: list[dict[str, str | None]],
) -> dict[str, Any]:
    """Return structured meeting notes and target markdown artefacts.

    Raises:
        RuntimeError: when processing is not configured or the API response is invalid.
    """

    if not transcript_processing_enabled():
        raise RuntimeError("Transcript processing is not configured because no OpenAI API key is set.")

    system_prompt = (
        "You convert raw meeting transcripts into polished markdown working artefacts for technology assessment work. "
        "Be concise, factual, and organised. Do not fabricate specifics that are not reasonably inferable from the transcript. "
        "If something is uncertain, label it as inferred or pending validation. "
        "Return structured meeting notes in markdown, then markdown for each requested extraction target."
    )

    target_list = "\n".join(
        f"- {target['name']}: {target.get('description') or 'No description provided.'}"
        for target in extraction_targets
    ) or "- None supplied"

    user_prompt = (
        f"Transcript title: {transcript_title}\n"
        f"Source label: {source_label or 'Uploaded transcript'}\n\n"
        "Requested extraction targets:\n"
        f"{target_list}\n\n"
        "Transcript content:\n"
        f"{transcript_text}"
    )

    schema = {
        "type": "object",
        "properties": {
            "structured_notes_markdown": {"type": "string"},
            "targets": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "markdown_content": {"type": "string"},
                    },
                    "required": ["name", "markdown_content"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["structured_notes_markdown", "targets"],
        "additionalProperties": False,
    }

    request_body = {
        "model": settings.openai_model,
        "input": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "transcript_processing_result",
                "schema": schema,
                "description": "Structured markdown outputs for one transcript and its extraction targets.",
                "strict": True,
            }
        },
    }

    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(OPENAI_RESPONSES_URL, headers=headers, json=request_body)

    if response.status_code >= 400:
        detail = response.text[:600]
        raise RuntimeError(f"OpenAI transcript processing failed ({response.status_code}): {detail}")

    payload = response.json()
    text = _extract_output_text(payload).strip()
    if not text:
        raise RuntimeError("OpenAI transcript processing returned no output text.")

    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError("OpenAI transcript processing returned invalid JSON.") from exc

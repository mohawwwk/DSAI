import asyncio
import base64
import json
import os
import re
import random
import time
from typing import Any, Dict, Iterator, List, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from youtube_transcript_api import YouTubeTranscriptApi
from google import genai

load_dotenv()

app = FastAPI()

# Enable CORS for frontend on port 5173
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
    "gemini-2.0-pro-exp",
    "gemini-1.5-pro",
    "gemini-3.1-pro-preview",
]

GROQ_MODELS = [
    "llama-3.3-70b-versatile",
]

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_RATE_LIMITED_UNTIL = 0.0

def is_groq_rate_limited() -> bool:
    return time.time() < GROQ_RATE_LIMITED_UNTIL


def mark_groq_rate_limited(backoff_seconds: int = 120) -> None:
    global GROQ_RATE_LIMITED_UNTIL
    GROQ_RATE_LIMITED_UNTIL = time.time() + backoff_seconds


YOUTUBE_ID_PATTERN = re.compile(
    r"(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})"
)


class UploadedFile(BaseModel):
    name: str
    mimeType: str
    size: int
    base64: str


class ChatHistoryItem(BaseModel):
    role: str
    content: str


class RunRequest(BaseModel):
    prompt: str
    files: List[UploadedFile] = Field(default_factory=list)
    chatHistory: List[ChatHistoryItem] = Field(default_factory=list)


def get_gemini_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY environment variable is missing. Please configure it in your Secrets.")
    return genai.Client(api_key=api_key)


def get_groq_api_key() -> Optional[str]:
    return os.getenv("GROQ_API_KEY")


def has_inline_content(contents: Any) -> bool:
    if isinstance(contents, list):
        return any(isinstance(item, dict) and "inline_data" in item for item in contents)
    return False


def format_contents_for_groq(contents: Any) -> str:
    if isinstance(contents, list):
        parts: List[str] = []
        for item in contents:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                if "text" in item:
                    parts.append(str(item["text"]))
                elif "inline_data" in item:
                    parts.append("[binary content omitted]")
                else:
                    parts.append(json.dumps(item))
            else:
                parts.append(str(item))
        return "\n".join(parts)
    return str(contents)


def should_fallback_to_groq(err: Optional[Exception]) -> bool:
    if err is None:
        return False
    message = str(err).lower()
    return any(token in message for token in [
        "quota",
        "resource_exhausted",
        "resource has been exhausted",
        "rate limit",
        "429",
        "503",
        "unavailable",
        "forbidden",
        "401",
        "not authorized",
    ])


async def call_groq_completion(contents: Any) -> Any:
    api_key = get_groq_api_key()
    if not api_key:
        raise RuntimeError("GROQ_API_KEY environment variable is missing.")

    prompt_text = format_contents_for_groq(contents)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    last_error: Optional[Exception] = None
    async with httpx.AsyncClient(timeout=60.0) as client:
        for model in GROQ_MODELS:
            for attempt in range(2):
                try:
                    response = await client.post(
                        GROQ_API_URL,
                        headers=headers,
                        json={
                            "model": model,
                            "messages": [{"role": "user", "content": prompt_text}],
                            "temperature": 0.2,
                            "max_tokens": 2048,
                        },
                    )
                    response.raise_for_status()
                    return normalize_model_response(response.json())
                except Exception as err:
                    last_error = err
                    msg = str(err).lower()
                    if any(token in msg for token in ["429", "503", "rate limit", "resource has been exhausted", "unavailable"]):
                        mark_groq_rate_limited(120)
                        if attempt < 1:
                            await asyncio.sleep((2 ** attempt) + random.random() * 0.5)
                            continue
                    break
    raise last_error


async def call_groq_completion_stream(contents: Any) -> Iterator[Any]:
    api_key = get_groq_api_key()
    if not api_key:
        raise RuntimeError("GROQ_API_KEY environment variable is missing.")

    prompt_text = format_contents_for_groq(contents)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    last_error: Optional[Exception] = None
    async with httpx.AsyncClient(timeout=120.0) as client:
        for model in GROQ_MODELS:
            for attempt in range(2):
                try:
                    response = await client.post(
                        GROQ_API_URL,
                        headers=headers,
                        json={
                            "model": model,
                            "messages": [{"role": "user", "content": prompt_text}],
                            "temperature": 0.2,
                            "max_tokens": 2048,
                            "stream": False,
                        },
                    )
                    response.raise_for_status()
                    return iter([normalize_model_response(response.json())])
                except Exception as err:
                    last_error = err
                    msg = str(err).lower()
                    if any(token in msg for token in ["429", "503", "rate limit", "resource has been exhausted", "unavailable"]):
                        mark_groq_rate_limited(120)
                        if attempt < 1:
                            await asyncio.sleep((2 ** attempt) + random.random() * 0.5)
                            continue
                    break
    raise last_error


def extract_youtube_id(text: str) -> Optional[str]:
    match = YOUTUBE_ID_PATTERN.search(text)
    return match.group(1) if match else None


def fetch_youtube_transcript(video_id: str) -> tuple[Optional[str], str]:
    """
    Fetch YouTube transcript with language fallback support.
    Returns: (transcript_text, status_message)
    """
    languages_to_try = ['en', 'es', 'fr', 'de', 'pt', 'it', 'ja', 'ko', 'zh-Hans', 'ru']
    
    try:
        # Try English first
        try:
            transcript_items = YouTubeTranscriptApi.get_transcript(video_id, languages=['en'])
            text = " ".join(item.get("text", "") for item in transcript_items)
            return text, f"Successfully fetched English transcript ({len(transcript_items)} segments)"
        except Exception:
            pass
        
        # Try to get list of available languages
        try:
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
            manual_transcripts = [t.language_code for t in transcript_list.manually_created_transcripts]
            generated_transcripts = [t.language_code for t in transcript_list.generated_transcripts]
            available = manual_transcripts + generated_transcripts
            
            # Try manually created transcripts first
            for lang_code in manual_transcripts:
                try:
                    transcript_items = YouTubeTranscriptApi.get_transcript(video_id, languages=[lang_code])
                    text = " ".join(item.get("text", "") for item in transcript_items)
                    return text, f"Successfully fetched manually created transcript ({len(transcript_items)} segments)"
                except Exception:
                    continue
            
            # Try generated transcripts
            for lang_code in generated_transcripts:
                try:
                    transcript_items = YouTubeTranscriptApi.get_transcript(video_id, languages=[lang_code])
                    text = " ".join(item.get("text", "") for item in transcript_items)
                    return text, f"Successfully fetched auto-generated transcript ({len(transcript_items)} segments)"
                except Exception:
                    continue
                    
        except Exception:
            # list_transcripts not available, try basic method
            for lang_code in languages_to_try:
                try:
                    transcript_items = YouTubeTranscriptApi.get_transcript(video_id, languages=[lang_code])
                    text = " ".join(item.get("text", "") for item in transcript_items)
                    return text, f"Successfully fetched transcript in {lang_code} ({len(transcript_items)} segments)"
                except Exception:
                    continue
        
        return None, "No transcripts available for this video (captions may be disabled or language not supported)"
        
    except Exception as e:
        error_msg = str(e)
        if "disabled" in error_msg.lower() or "no transcript" in error_msg.lower():
            return None, "Video has captions disabled or transcripts unavailable"
        return None, f"Transcript fetch error: {error_msg}"


def normalize_model_response(response: Any) -> Any:
    if not isinstance(response, dict):
        return response

    if "text" in response and response["text"] is not None:
        return {"text": str(response["text"])}

    choices = response.get("choices")
    if isinstance(choices, list) and choices:
        choice = choices[0]
        if isinstance(choice, dict):
            message = choice.get("message")
            if isinstance(message, dict) and message.get("content") is not None:
                return {"text": str(message["content"])}
            if choice.get("text") is not None:
                return {"text": str(choice["text"])}

    output_text = response.get("output_text") or response.get("output")
    if isinstance(output_text, str):
        return {"text": output_text}

    return response


def flatten_response_text(response: Any) -> str:
    if response is None:
        return ""
    if isinstance(response, dict):
        normalized = normalize_model_response(response)
        if isinstance(normalized, dict):
            return normalized.get("text", "")
    if hasattr(response, "text") and response.text:
        return str(response.text)
    parts = getattr(response, "parts", None)
    if parts:
        collected: List[str] = []
        for part in parts:
            if isinstance(part, dict):
                if part.get("text"):
                    collected.append(str(part["text"]))
            else:
                part_text = getattr(part, "text", None)
                if part_text:
                    collected.append(str(part_text))
        return "".join(collected)
    return ""


def is_transient_error(err: Exception) -> bool:
    message = str(err).lower()
    if any(token in message for token in ["503", "unavailable", "high demand", "spikes in demand", "resource has been exhausted", "resource_exhausted", "429", "500", "rate limit"]):
        return True
    status = getattr(err, "status", None) or getattr(err, "status_code", None)
    return status in {429, 500, 503}


async def call_generate_content(client: genai.Client, contents: Any, config: Optional[Dict[str, Any]] = None) -> Any:
    last_error: Optional[Exception] = None
    use_groq_first = get_groq_api_key() is not None and not has_inline_content(contents) and not is_groq_rate_limited()

    if use_groq_first:
        try:
            print("[Groq Fallback] Using Groq first for text generation.")
            return await call_groq_completion(contents)
        except Exception as err:
            last_error = err
            print(f"[Groq Fallback] Initial Groq generate_content attempt failed: {err}")
    elif get_groq_api_key() is not None and is_groq_rate_limited():
        print("[Groq Fallback] Groq currently rate-limited; skipping to Gemini.")

    max_retries = 3
    for active_model in GEMINI_MODELS:
        attempts = 0
        while attempts < max_retries:
            try:
                return client.models.generate_content(model=active_model, contents=contents, config=config)
            except Exception as err:
                last_error = err
                if is_transient_error(err):
                    attempts += 1
                    if attempts < max_retries:
                        await asyncio.sleep((2 ** attempts) + random.random() * 0.5)
                        continue
                break

    if get_groq_api_key() and not has_inline_content(contents) and should_fallback_to_groq(last_error):
        try:
            return await call_groq_completion(contents)
        except Exception as err:
            print(f"[Groq Fallback] Secondary Groq generate_content attempt failed: {err}")
            pass

    raise last_error


async def call_generate_content_stream(client: genai.Client, contents: Any, config: Optional[Dict[str, Any]] = None) -> Iterator[Any]:
    last_error: Optional[Exception] = None
    use_groq_first = get_groq_api_key() is not None and not has_inline_content(contents) and not is_groq_rate_limited()

    if use_groq_first:
        try:
            print("[Groq Fallback] Using Groq first for streaming generation.")
            return await call_groq_completion_stream(contents)
        except Exception as err:
            last_error = err
            print(f"[Groq Fallback] Initial Groq generate_content_stream attempt failed: {err}")
    elif get_groq_api_key() is not None and is_groq_rate_limited():
        print("[Groq Fallback] Groq currently rate-limited; skipping to Gemini stream.")

    max_retries = 3
    for active_model in GEMINI_MODELS:
        attempts = 0
        while attempts < max_retries:
            try:
                return client.models.generate_content_stream(model=active_model, contents=contents, config=config)
            except Exception as err:
                last_error = err
                if is_transient_error(err):
                    attempts += 1
                    if attempts < max_retries:
                        await asyncio.sleep((2 ** attempts) + random.random() * 0.5)
                        continue
                break

    if get_groq_api_key() and not has_inline_content(contents) and should_fallback_to_groq(last_error):
        try:
            return await call_groq_completion_stream(contents)
        except Exception as err:
            print(f"[Groq Fallback] Secondary Groq generate_content_stream attempt failed: {err}")
            pass

    raise last_error


async def call_intent_assessor(client: genai.Client, unified_context: str) -> Dict[str, Any]:
    prompt_text = (
        "Verify the task and completeness of the context.\n"
        "You must analyze if clarification is needed prior to executing the user query.\n"
        "Output a JSON object conforming exactly to this schema:\n"
        "{\n"
        "  \"isFollowUpRequired\": true or false,\n"
        "  \"followUpQuestion\": \"A short descriptive follow-up question here if isFollowUpRequired is true, else null\",\n"
        "  \"detectedTask\": \"summarization\" or \"sentiment\" or \"code_explanation\" or \"transcript_summary\" or \"cross_input_reasoning\" or \"general_qa\",\n"
        "  \"reasoningPlan\": [\"Step 1 description\", \"Step 2 description\"]\n"
        "}\n\n"
        f"Context:\n{unified_context}"
    )

    response = await call_generate_content(
        client,
        contents=[prompt_text],
        config={
            "response_mime_type": "application/json",
            "response_schema": {
                "type": "object",
                "properties": {
                    "isFollowUpRequired": {"type": "boolean"},
                    "followUpQuestion": {"type": "string"},
                    "detectedTask": {"type": "string"},
                    "reasoningPlan": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
                "required": ["isFollowUpRequired", "detectedTask", "reasoningPlan"],
            },
        },
    )

    text_output = flatten_response_text(response).strip() or "{}"
    cleaned_text = text_output.replace("```json", "").replace("```", "").strip()
    return json.loads(cleaned_text)


def format_event(event_type: str, payload: Dict[str, Any]) -> str:
    return f"data: {json.dumps({ 'type': event_type, **payload })}\n\n"


async def run_agent_pipeline(body: RunRequest) -> Iterator[str]:
    plan_trace: List[Dict[str, Any]] = []
    extracted_contents: List[Dict[str, Any]] = []
    estimated_input_tokens = 0
    estimated_output_tokens = 0

    def emit_step(name: str, status: str, description: str) -> str:
        step = {
            "name": name,
            "status": status,
            "description": description,
            "timestamp": time.strftime("%H:%M:%S"),
        }
        plan_trace.append(step)
        return format_event("step", {"step": step})

    try:
        client = get_gemini_client()
    except Exception as err:
        yield format_event("error", {"message": str(err)})
        return

    yield emit_step("Initialize Request", "success", "Received request, validated prompt inputs.")

    if body.files:
        yield emit_step("Multimodal Extractors", "running", f"Processing {len(body.files)} uploads concurrently...")
        for file in body.files:
            raw_base64 = file.base64.split(",", 1)[1] if "," in file.base64 else file.base64
            mime_type = file.mimeType
            file_text = ""
            ocr_confidence: Optional[int] = None
            duration: Optional[str] = None
            estimated_input_tokens += len(raw_base64) // 4
            try:
                if mime_type.startswith("image/"):
                    response = await call_generate_content(
                        client,
                        contents=[
                            {"inline_data": {"mime_type": mime_type, "data": raw_base64}},
                            "Perform optical character recognition (OCR) and extract all readable text or code from this image. Output a JSON object with this precise scheme: { \"text\": \"extracted text/code here\", \"confidence\": 95 } where confidence is an integer from 0 to 100 indicating extraction quality.",
                        ],
                        config={
                            "response_mime_type": "application/json",
                            "response_schema": {
                                "type": "object",
                                "properties": {
                                    "text": {"type": "string"},
                                    "confidence": {"type": "integer"},
                                },
                                "required": ["text", "confidence"],
                            },
                        },
                    )
                    parsed = json.loads(flatten_response_text(response) or "{}")
                    file_text = parsed.get("text", "")
                    ocr_confidence = parsed.get("confidence", 90)
                elif mime_type == "application/pdf":
                    response = await call_generate_content(
                        client,
                        contents=[
                            {"inline_data": {"mime_type": mime_type, "data": raw_base64}},
                            "Analyze this PDF document. Extract all readable text, tables, headers, and code snippets. Output a JSON object with this precise scheme: { \"text\": \"extracted text and layout details here\", \"confidence\": 95 } where confidence is an integer indicating your parsing assessment.",
                        ],
                        config={
                            "response_mime_type": "application/json",
                            "response_schema": {
                                "type": "object",
                                "properties": {
                                    "text": {"type": "string"},
                                    "confidence": {"type": "integer"},
                                },
                                "required": ["text", "confidence"],
                            },
                        },
                    )
                    parsed = json.loads(flatten_response_text(response) or "{}")
                    file_text = parsed.get("text", "")
                    ocr_confidence = parsed.get("confidence", 90)
                elif mime_type.startswith("audio/"):
                    response = await call_generate_content(
                        client,
                        contents=[
                            {"inline_data": {"mime_type": mime_type, "data": raw_base64}},
                            "Listen to this audio file and transcribe all spoken dialogue clearly. Extract or estimate the total audio duration in minutes and seconds (e.g. '04:15'). Output a JSON object with this precise scheme: { \"text\": \"clean transcription here\", \"duration\": \"04:15\" }.",
                        ],
                        config={
                            "response_mime_type": "application/json",
                            "response_schema": {
                                "type": "object",
                                "properties": {
                                    "text": {"type": "string"},
                                    "duration": {"type": "string"},
                                },
                                "required": ["text", "duration"],
                            },
                        },
                    )
                    parsed = json.loads(flatten_response_text(response) or "{}")
                    file_text = parsed.get("text", "")
                    duration = parsed.get("duration", "0:00")
                else:
                    file_text = str(base64.b64decode(raw_base64), "utf-8", errors="replace")
                    ocr_confidence = 100

                extracted_contents.append({
                    "fileName": file.name or "unnamed_file",
                    "mimeType": mime_type,
                    "text": file_text,
                    "ocrConfidence": ocr_confidence,
                    "duration": duration,
                })
            except Exception as err:
                yield emit_step("File Extraction Error", "error", f"Extraction failed for {file.name}: {err}")

        if extracted_contents:
            yield emit_step("Multimodal Extractors", "success", f"Extracted text/audio contents from {len(extracted_contents)} file(s).")
        else:
            yield emit_step("Multimodal Extractors", "error", "No file extractions succeeded.")
    else:
        yield emit_step("Multimodal Extractors", "skipped", "No files uploaded.")

    combined_context = f"{body.prompt}\n\n" + "\n\n".join(item["text"] for item in extracted_contents if item.get("text"))
    yt_video_id = extract_youtube_id(combined_context)
    youtube_transcript_text = ""

    if yt_video_id:
        yield emit_step("YouTube URL Scanner", "success", f"Detected YouTube video link (ID: {yt_video_id}). Fetching transcript...")
        transcript_text, status_msg = fetch_youtube_transcript(yt_video_id)
        
        if transcript_text:
            youtube_transcript_text = transcript_text
            yield emit_step("YouTube Transcript Fetcher", "success", status_msg)
        else:
            youtube_transcript_text = f"[YouTube Transcript Fallback: {status_msg}]"
            yield emit_step("YouTube Transcript Fetcher", "warning", status_msg)
    else:
        yield emit_step("YouTube URL Scanner", "skipped", "No YouTube video link detected in prompt or files.")

    unified_context_parts: List[str] = ["=== USER QUERY ===", body.prompt, "\n"]
    if body.chatHistory:
        unified_context_parts.append("=== CHAT HISTORY ===")
        for item in body.chatHistory:
            unified_context_parts.append(f"{item.role.upper()}: {item.content}")
        unified_context_parts.append("\n")
    if extracted_contents:
        unified_context_parts.append("=== EXTRACTED FILE CONTENTS ===")
        for item in extracted_contents:
            unified_context_parts.append(f"[File: {item['fileName']} ({item['mimeType']})]")
            if item.get("ocrConfidence") is not None:
                unified_context_parts.append(f"(OCR Confidence: {item['ocrConfidence']}%)")
            if item.get("duration"):
                unified_context_parts.append(f"(Audible Duration: {item['duration']})")
            unified_context_parts.append(item.get("text", ""))
            unified_context_parts.append("\n")
    if youtube_transcript_text:
        unified_context_parts.append("=== YOUTUBE VIDEO TRANSCRIPT ===")
        unified_context_parts.append(youtube_transcript_text)
        unified_context_parts.append("\n")

    unified_context = "\n".join(unified_context_parts)
    estimated_input_tokens += len(unified_context) // 4

    yield emit_step("Intent Assessor", "running", "Analyzing completeness and task suitability...")

    try:
        assessment = await call_intent_assessor(client, unified_context)
    except Exception as err:
        assessment = {
            "isFollowUpRequired": False,
            "detectedTask": "general_qa",
            "reasoningPlan": ["Failsafe fallback plan initialized due to network rate constraints."],
        }
        yield emit_step("Intent Assessor", "error", f"Intent assessment failed, falling back to safe plan. {err}")

    reasoning_plan = assessment.get("reasoningPlan")
    if isinstance(reasoning_plan, list):
        for plan_step in reasoning_plan:
            yield emit_step("Planned Strategy Step", "success", plan_step)

    if assessment.get("isFollowUpRequired"):
        yield format_event("done", {
            "response": {
                "isFollowUpRequired": True,
                "followUpQuestion": assessment.get("followUpQuestion") or "Could you clarify what you would like me to perform on this content?",
                "extractedContents": extracted_contents,
                "planTrace": plan_trace,
                "estimatedInputTokens": estimated_input_tokens,
                "estimatedOutputTokens": estimated_output_tokens,
                "estimatedCostUsd": 0.0,
            }
        })
        return

    yield emit_step("Intent Assessor", "success", f"Identified task context: [{assessment.get('detectedTask', 'general_qa').upper()}]. Proceeding to build result.")
    yield emit_step("Generator Pipeline", "running", "Synthesizing streamed analysis response...")

    final_query_prompt = f"""Ensure you strictly satisfy the requirements for this specific task:
- Detected Task: \"{assessment.get('detectedTask')}\"
- Specific Rules for Tasks:
  - If \"summarization\": You MUST format and return exactly three components explicitly:
    1. A \"1-Line Summary\" (labeled clearly)
    2. \"3 Key Bullet Points\" (labeled clearly)
    3. A \"5-Sentence Summary\" (labeled clearly)
  - If \"sentiment\": You MUST output:
    1. A Sentiment Label (Positive / Negative / Neutral)
    2. A Confidence Percentage (e.g. 95%)
    3. A direct \"1-Line Justification\"
  - If \"code_explanation\": You MUST output:
    1. An elegant explanation of what the code does
    2. Bug detection / warning about any bugs found
    3. Strict \"Time and Space Complexity Analysis\"
  - If \"transcript_summary\" or \"audio transcription + summary\": You MUST output:
    1. Fully cleaned audio transcription text
    2. A \"1-Line Summary\"
    3. \"3 Bullet Points\"
    4. A \"5-Sentence Summary\"
    5. Mention any duration or files referenced.
  - If \"cross_input_reasoning\": Combine, contrast, and reference multiple inputs gracefully (such as files, transcription logs, or queries) in a unified, professional comparative breakdown.

Unified context:
{unified_context}

Generate your response in pristine Markdown format. Make it direct, clean, without tech-larping or metadata banners. Ensure it satisfies all the strict conditions above."""

    full_final_result_text = ""
    response_stream = await call_generate_content_stream(
        client,
        contents=final_query_prompt,
    )

    try:
        for chunk in response_stream:
            chunk_text = flatten_response_text(chunk)
            if chunk_text:
                full_final_result_text += chunk_text
                yield format_event("chunk", {"text": chunk_text})
    except Exception as err:
        yield emit_step("Generator Pipeline", "error", f"Streaming generation failed: {err}")
        yield format_event("error", {"message": str(err)})
        return

    estimated_input_tokens += len(final_query_prompt) // 4
    estimated_output_tokens += len(full_final_result_text) // 4
    estimated_cost_usd = round((estimated_input_tokens * 0.000000075) + (estimated_output_tokens * 0.0000003), 6)

    yield emit_step("Generator Pipeline", "success", "Response stream completed and validated.")
    yield format_event("done", {
        "response": {
            "isFollowUpRequired": False,
            "finalResult": full_final_result_text,
            "extractedContents": extracted_contents,
            "planTrace": plan_trace,
            "estimatedInputTokens": estimated_input_tokens,
            "estimatedOutputTokens": estimated_output_tokens,
            "estimatedCostUsd": estimated_cost_usd,
        }
    })



@app.post("/agent/run")
@app.post("/api/agent/run")
async def agent_run(body: RunRequest):
    return StreamingResponse(run_agent_pipeline(body), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "Connection": "keep-alive"})


@app.get("/")
async def read_root() -> Any:
    dist_index = os.path.join(os.getcwd(), "dist", "index.html")
    if os.path.exists(dist_index):
        return FileResponse(dist_index)
    return {"status": "FastAPI backend is running."}

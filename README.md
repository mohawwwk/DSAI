# Agentic Multimodal Orchestrator

An agentic application that accepts multiple simultaneous input types — Text, Images, PDFs, and Audio — extracts content, understands the user's goal, and autonomously performs the correct task including complex multi-step queries requiring tool chaining. If the goal is unclear, the agent asks a follow-up question before acting.

**Live URL:** [Deployed on Replit](https://agentic-multimodal-orchestrator.replit.app)

---

## Features

| Capability | Details |
|---|---|
| **Multi-input support** | Text, Image (OCR), PDF (parse + OCR fallback), Audio (speech-to-text) — multiple files simultaneously |
| **Intent Assessor** | Classifies task type (summarization, sentiment, code, transcript, cross-input, QA); asks follow-up if ambiguous |
| **Task coverage** | Summarization, Sentiment Analysis, Code Explanation, Audio Transcription + Summary, YouTube Transcript Fetching, Cross-Input Reasoning, General Q&A |
| **Streaming output** | Token-by-token SSE streaming in the chat UI |
| **Plan trace** | Live step-by-step reasoning trace visible in the Reasoning Trace panel |
| **Cost estimator** | Approximate token and API cost shown per run (bonus) |
| **Dual-model pipeline** | Groq (Llama 3.3 70B) for text tasks; Gemini 2.5 Flash for multimodal; automatic fallback between both |

---

## Architecture

```
User Input (Text + Files)
        │
        ▼
┌─────────────────────────┐
│   Multimodal Extractors │  Image → Gemini OCR
│                         │  PDF   → pdfplumber + OCR fallback
│                         │  Audio → Gemini speech-to-text
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│   YouTube URL Scanner   │  Detects youtube.com / youtu.be links
│                         │  anywhere in prompt or extracted content
│                         │  → fetches transcript via youtube-transcript-api
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│   Intent Assessor       │  Groq / Gemini → JSON output
│                         │  detectedTask + reasoningPlan
│                         │  → asks follow-up if goal is ambiguous
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│   Generator Pipeline    │  Streams final result via SSE
│   (Groq → Gemini)       │  Enforces task-specific output format
└────────┬────────────────┘
         │
         ▼
    React Chat UI
    ├── Reasoning Trace panel  (live step list)
    ├── Extracted Media panel  (OCR / transcript text)
    ├── Architecture Diagram tab
    └── Cost Estimator         (tokens + USD estimate)
```

---

## Sample Test Cases

All 5 preset buttons are available directly in the UI.

| # | Input | Query | Expected Output |
|---|-------|-------|----------------|
| 1 | Audio file (MP3/WAV/M4A) | "Transcribe and summarize" | Transcription → 1-line summary + 3 bullets + 5-sentence summary + duration |
| 2 | PDF with meeting notes | "What are the action items?" | Extracted text → action items only |
| 3 | Image screenshot with code | "Explain" | OCR → language detection → code explanation + bug warnings + time/space complexity |
| 4 | PDF containing a YouTube URL | "Hit the YouTube URL and summarize it" | PDF parsed → YouTube URL detected → transcript fetched → 1-line + bullets + 5-sentence summary |
| 5 | Audio file + PDF document | "Do they discuss the same topic?" | Audio transcribed + PDF parsed → comparative cross-input analysis |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google Gemini API key — used for multimodal tasks (image, audio, PDF OCR) and as fallback for text |
| `GROQ_API_KEY` | Yes | Groq API key — used as the primary provider for text-only tasks (faster, cheaper) |

Get your keys:
- **Gemini**: [aistudio.google.com](https://aistudio.google.com) → Get API Key
- **Groq**: [console.groq.com](https://console.groq.com) → API Keys

> **Note:** Do not commit real API keys. Use `.env` locally or Replit Secrets in deployment.

---

## Local Setup

**Prerequisites:** Node.js 18+, Python 3.12+

```bash
# 1. Install dependencies
npm install
pip install -r requirements.txt

# 2. Set environment variables
echo "GEMINI_API_KEY=your_gemini_key" > .env
echo "GROQ_API_KEY=your_groq_key" >> .env

# 3. Start backend (terminal 1)
python run_backend.py
# → FastAPI on http://localhost:8000

# 4. Start frontend (terminal 2)
npm run dev
# → Vite on http://localhost:5000
```

Open **http://localhost:5000** in your browser.

---

## Docker Deployment

```bash
docker build -t agentic-multimodal:latest .

docker run -p 5000:5000 \
  -e GEMINI_API_KEY=your_gemini_key \
  -e GROQ_API_KEY=your_groq_key \
  agentic-multimodal:latest
```

The Dockerfile uses a multi-stage build: Node.js compiles the Vite frontend into `dist/`, then Python serves both the API and static files from a single container on port 5000.

---

## Replit Deployment

Set `GEMINI_API_KEY` and `GROQ_API_KEY` in **Replit Secrets** (🔒 icon in the sidebar).

- **Dev mode**: `npm run dev` (Vite on port 5000, proxies `/api` → FastAPI on port 8000)
- **Production**: `npm run build` then `python backend.py` (serves `dist/` + API on port 5000)

---

## Render Deployment

A `render.yaml` config is included. Connect your GitHub repo to Render, set the two environment variables in the Render dashboard, and deploy.

---

## API Reference

**POST** `/api/agent/run`

```json
{
  "prompt": "What are the action items?",
  "files": [
    {
      "name": "meeting.pdf",
      "mimeType": "application/pdf",
      "size": 102400,
      "base64": "<base64-encoded-content>"
    }
  ],
  "chatHistory": []
}
```

**Response:** Server-Sent Events stream with these event types:

| Event | Payload | Description |
|---|---|---|
| `step` | `{ step: { name, status, description, timestamp } }` | Live reasoning trace update |
| `chunk` | `{ text: "..." }` | Streamed output token |
| `done` | `{ response: { finalResult, extractedContents, planTrace, estimatedInputTokens, estimatedOutputTokens, estimatedCostUsd } }` | Final result |
| `error` | `{ message: "..." }` | Pipeline error |

---

## Design Decisions

- **FastAPI** for async SSE streaming and clean route definitions with Pydantic validation
- **React + Vite** for a fast, minimal chat-like UI with real-time streaming
- **Modular extractors** — each input type (image, PDF, audio) is handled independently; results are merged into a unified context string before the intent assessor runs
- **Groq-first, Gemini-fallback** — Groq (Llama 3.3 70B) handles all text-only tasks for speed and cost; Gemini 2.5 Flash handles multimodal inputs and acts as the fallback when Groq is rate-limited
- **JSON mode for intent assessment** — Groq is called with `response_format: json_object` to guarantee structured output; the intent assessor never silently falls back to freeform text
- **No secrets in repo** — API keys are passed via environment variables only; `.env` is in `.gitignore`

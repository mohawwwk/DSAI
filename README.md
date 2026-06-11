


This repository contains an agentic multimodal orchestrator (FastAPI backend + Vite React frontend).

Features
- Accepts text, images (OCR), PDFs (text + OCR fallback), and audio (speech-to-text).
- Automatic intent assessment, follow-up question handling, and tool-chaining planner.
- SSE streaming for real-time reasoning traces and tokenized outputs.
- Groq / Gemini generator integration with rate-limit fallback.

Quick links
- Local app (dev): http://localhost:3000
- Backend (dev): http://localhost:8001

## Setup (Local)

Prerequisites
- Node.js 18+
- Python 3.14+
- Docker (optional, for container runs)

1. Install frontend and backend deps:

```bash
npm install
python -m pip install -r requirements.txt
```

2. Create `.env` from the example and set secrets (DO NOT commit real keys):

```text
cp .env.example .env
# edit .env and set GEMINI_API_KEY and optionally GROQ_API_KEY and APP_URL
```

3. Start backend and frontend (two terminals):

Backend:
```bash
py run_backend.py
# or: python run_backend.py
# backend listens on http://0.0.0.0:8001
```

Frontend:
```bash
npm run dev
# frontend listens on http://localhost:3000
```

Open the app in a browser at `http://localhost:3000`.

## Usage

- Upload one or more files (Image/PDF/Audio) and enter a text prompt in the input box.
- The UI streams step-by-step reasoning in the "Reasoning Trace" panel and displays extracted media in the "Extracted Media" tab.
- Final outputs are text-only and include `extractedContents` in the SSE `done` event.

API (programmatic)
- POST to `/api/agent/run` with JSON body matching the `RunRequest` schema:

```json
{
  "prompt": "Summarize the document",
  "files": [],
  "chatHistory": []
}
```

The endpoint streams SSE events; the last event contains the `response.finalResult` and `response.extractedContents`.

## Deployment

Two recommended flows are provided:

1) Render (recommended)
- `render.yaml` manifest is included. Connect the GitHub repo in Render, set environment variables (`GEMINI_API_KEY`, `GROQ_API_KEY`, `APP_URL`) in the Render dashboard, and deploy.

2) Docker
- Build and run locally:

```bash
docker build -t agentic-multimodal:latest .
docker run -p 8000:8000 -e GEMINI_API_KEY=your_key -e GROQ_API_KEY=your_key agentic-multimodal:latest
```

The Dockerfile is a multi-stage image that builds the Vite frontend and copies `dist` into the Python backend image.

## Design decisions (short)

- Backend: FastAPI for lightweight, async SSE streaming and extensibility.
- Frontend: React + Vite for fast development iteration and a simple chat-like UI.
- Multimodal pipeline: modular extractors (OCR, PDF parser, speech-to-text), then an intent assessor that produces a plan which the generator executes. This enables autonomous multi-tool chaining.
- Fallbacks: Groq is used if available; Gemini is primary generator. Rate-limit state avoids repeated Groq attempts.
- Security: secrets are read from environment variables. Never commit any API key; `.env.example` contains placeholders.

## Tests & Sample cases

Included in the repo are `test_payload.json` and `test_smoke.json` for quick smoke tests. Use the example Python scripts (or the UI) to validate the pipeline.

## Next steps (recommended)

- Add GitHub Actions to build and push Docker images automatically (CI/CD). I can add this workflow if you want.
- Add end-to-end tests and example sample inputs for the assignment test cases.

## Contact

If you want, I can add the CI workflow and deployment automation now and push it to the repository.

----
Updated README with setup, usage, deployment and design decisions.

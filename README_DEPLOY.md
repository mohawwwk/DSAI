# Deployment Guide — agentic-multimodal-orchestrator

This file explains how to deploy the app (FastAPI backend + Vite frontend) to a public host.

Required env vars (set these in your host or Render dashboard):
- GEMINI_API_KEY — Google Gemini API key
- GROQ_API_KEY — Groq API key (optional; used as fallback)
- APP_URL — public URL of the app (optional)

Option A — Deploy to Render (recommended)
1. Push this repository to GitHub.
2. On Render, create a new Web Service and connect your GitHub repo.
3. Choose "Docker" as the environment and confirm `Dockerfile` is at repository root.
4. If Render asks for a start command, use:

```
uvicorn local_backend:app --host 0.0.0.0 --port $PORT
```

5. Add the required environment variables in Render's dashboard (GEMINI_API_KEY, GROQ_API_KEY).
6. Deploy. The live URL appears in the Render service dashboard.

Option B — Build and push Docker image manually
1. Build locally:

```bash
docker build -t yourdockerhubusername/agentic-multimodal:latest .
```

2. Push to Docker Hub (login first):

```bash
docker push yourdockerhubusername/agentic-multimodal:latest
```

3. Run on any host with the env vars set:

```bash
docker run -p 8000:8000 -e GEMINI_API_KEY=your_key -e GROQ_API_KEY=your_key yourdockerhubusername/agentic-multimodal:latest
```

Option C — Deploy to GCP / AWS / Azure
Use the Docker image above and follow your provider's container deployment guide.

Notes
- The `render.yaml` manifest is provided for Render's Infrastructure-as-Code flow.
- Verify `requirements.txt` contains all Python dependencies before building the image.
- The Dockerfile does a multi-stage build: it builds the frontend and copies the `dist` folder into the Python image.

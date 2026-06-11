FROM node:18-bullseye-slim AS frontend-build
WORKDIR /src

# Install frontend deps and build
COPY package.json package-lock.json* ./
RUN apt-get update && apt-get install -y python3 make gcc g++ && rm -rf /var/lib/apt/lists/* || true
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

FROM python:3.14-slim
WORKDIR /app

# Install Python dependencies
COPY requirements.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt

# Copy source and built frontend
COPY . /app
COPY --from=frontend-build /src/dist /app/dist

ENV GEMINI_API_KEY=""
ENV GROQ_API_KEY=""
ENV APP_URL=""

EXPOSE 8000

# Run the FastAPI backend which will serve `dist` if present
CMD ["uvicorn", "local_backend:app", "--host", "0.0.0.0", "--port", "8000"]

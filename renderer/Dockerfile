FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg libcairo2-dev libpango1.0-dev pkg-config gcc python3-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV MANIM_RENDERER_SECRET=change-me \
    MANIM_ARTIFACTS_DIR=/data/artifacts
VOLUME ["/data/artifacts"]
EXPOSE 8765
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8765"]

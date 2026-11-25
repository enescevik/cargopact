FROM --platform=linux/arm64 ghcr.io/astral-sh/uv:python3.12-bookworm-slim
WORKDIR /app
COPY requirements.txt .
RUN uv pip install --system -r requirements.txt
COPY src/ ./src/
ENV PYTHONPATH=/app/src PYTHONUNBUFFERED=1
EXPOSE 8080
CMD ["python", "-m", "cargopact_agents.main"]

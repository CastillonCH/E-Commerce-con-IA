# Opcional — para correr el servicio sin instalar Python/PyTorch a mano.
# Build:  docker build -t novastore-ia .
# Correr: docker run -p 8000:8000 --env-file .env -v ${PWD}/models:/app/models novastore-ia
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ app/

ENV MODELS_DIR=/app/models
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

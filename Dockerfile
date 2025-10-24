FROM ubuntu:22.04 AS cpp-build

RUN apt update && apt install -y build-essential cmake
WORKDIR /app/backend

COPY backend/ ./

RUN cmake -B build -S . && cmake --build build --config Release


FROM node:20 AS frontend-build

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build


FROM python:3.11-slim AS runtime

RUN apt update && apt install -y libstdc++6 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/bridge

COPY bridge/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY bridge/ ./

COPY --from=cpp-build /app/backend/build/ITS /app/bridge/bin/ITS

COPY --from=frontend-build /app/frontend/dist /app/bridge/static/dist

ENV PATH="/app/bridge/bin:${PATH}"
ENV PYTHONPATH=/app/bridge

WORKDIR /app

EXPOSE 8228

CMD ["uvicorn", "bridge.main:app", "--host", "0.0.0.0", "--port", "8228"]

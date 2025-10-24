FROM ubuntu:22.04 AS core-build

RUN apt update && apt install -y build-essential cmake

WORKDIR /app/core
COPY core /app/core

RUN cmake -B build -S . && cmake --build build --config Release

RUN find /app/core/build -type f -executable -exec echo {} \; > /binary_path.txt


FROM node:20 AS frontend-build

WORKDIR /app/src
COPY src /app/src

RUN npm install && npm run build


FROM python:3.11-slim AS runtime

RUN apt update && apt install -y libstdc++6 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/bridge

COPY bridge/requirements.txt /app/bridge/requirements.txt

RUN pip install --no-cache-dir -r /app/bridge/requirements.txt

COPY bridge /app/bridge

COPY --from=core-build /binary_path.txt /tmp/binary_path.txt

RUN mkdir -p /app/bridge/bin && \
    cp $(cat /tmp/binary_path.txt) /app/bridge/bin/

COPY --from=frontend-build /app/src/dist /app/bridge/static/dist

ENV PATH="/app/bridge/bin:${PATH}"

ENV PYTHONPATH=/app/bridge

EXPOSE 8228

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8228"]

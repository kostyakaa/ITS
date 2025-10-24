import json
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from .models import SessionManager, Session
from config import BIN_PATH

app = FastAPI()
manager = SessionManager()


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    session: Optional[Session] = None

    try:
        raw = await ws.receive_text()
        try:
            msg = json.loads(raw)
        except Exception:
            await ws.send_json({"type": "error", "error": "expected JSON"})
            await ws.close()
            return

        if msg.get("type") != "create":
            await ws.send_json({"type": "error", "error": "send {'type':'create'} first"})
            await ws.close()
            return

        session = await manager.create(ws, cmd=[str(BIN_PATH)])
        await ws.send_json({"type": "created", "session_id": session.session_id})

        await session.batch_sender_task

    except WebSocketDisconnect:
        pass
    finally:
        if session:
            await manager.remove(session.session_id)

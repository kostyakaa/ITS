from .session import Session
from typing import Optional, List
import uuid


class SessionManager:
    def __init__(self):
        self.sessions = {}

    async def create(self, ws, cmd: Optional[List[str]] = None) -> Session:
        session_id = str(uuid.uuid4())
        print("kdasdaskjdaskjd")
        s = Session(ws=ws, session_id=session_id, cmd=(cmd or ["./test"]))
        self.sessions[session_id] = s
        await s.start()
        return s

    async def remove(self, session_id: str):
        s = self.sessions.pop(session_id, None)
        if s:
            await s.close()

    async def shutdown(self):
        for sid in list(self.sessions.keys()):
            await self.remove(sid)

from dataclasses import dataclass, field
from typing import Optional, List
import asyncio
import contextlib
from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState
import json
import logging

uvicorn_logger = logging.getLogger("uvicorn.error")

from ..config import *
from ..utils import kill_process_tree, convert_msg_to_dict


@dataclass
class Session:
    ws: WebSocket
    session_id: str
    cmd: List[str] = field(default_factory=lambda: ["./test"])
    proc: Optional[asyncio.subprocess.Process] = None
    out_queue: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=OUT_QUEUE_MAXSIZE))
    read_stdout_task: Optional[asyncio.Task] = None
    batch_sender_task: Optional[asyncio.Task] = None
    stdin_pump_task: Optional[asyncio.Task] = None
    closed: bool = False

    async def start(self):
        self.proc = await asyncio.create_subprocess_exec(
            *self.cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            start_new_session=True,
        )

        self.read_stdout_task = asyncio.create_task(self._read_stdout())
        self.batch_sender_task = asyncio.create_task(self._batch_sender())
        self.stdin_pump_task = asyncio.create_task(self._stdin_pump())

    async def _read_stdout(self):
        assert self.proc and self.proc.stdout
        reader = self.proc.stdout
        try:
            while True:
                line = await reader.readline()
                if not line:
                    await self.out_queue.put("[SIM] <EOF>")
                    break
                text = line.decode('utf-8', errors='replace').rstrip("\r\n")
                try:
                    for part in text.split(";"):
                        part = part.strip()
                        if not part:
                            continue
                        self.out_queue.put_nowait(part)
                except asyncio.QueueFull:
                    pass
        except Exception as e:
            await self.out_queue.put(f"[SIM] <reader error: {e}>")

    async def _batch_sender(self):
        try:
            buffer: List[str] = []
            flush_interval = FLUSH_INTERVAL_MS / 1000.0
            max_batch_size = 5
            last_flush = asyncio.get_event_loop().time()

            async def flush():
                nonlocal buffer, last_flush
                if not buffer:
                    return
                if self.ws.application_state != WebSocketState.CONNECTED:
                    buffer = []
                    last_flush = asyncio.get_event_loop().time()
                    return
                try:
                    await self.ws.send_json({"type": "batch", "commands": list(map(convert_msg_to_dict, buffer))})
                except (WebSocketDisconnect, RuntimeError):
                    buffer = []
                    return
                buffer = []
                last_flush = asyncio.get_event_loop().time()

            while True:
                try:
                    try:
                        line = await asyncio.wait_for(self.out_queue.get(), timeout=flush_interval)
                        buffer.append(line)
                    except asyncio.TimeoutError:
                        pass

                    if self.proc and self.proc.returncode is not None and self.out_queue.empty():
                        await flush()
                        break

                    now = asyncio.get_event_loop().time()
                    if len(buffer) >= max_batch_size or (now - last_flush) >= flush_interval:
                        await flush()

                except WebSocketDisconnect:
                    buffer = []
                    break
        finally:
            try:
                await flush()
            except Exception:
                pass

    async def _stdin_pump(self):
        """Слушает WS и отправляет всё в stdin симуляции."""
        assert self.proc and self.proc.stdin
        writer = self.proc.stdin
        try:
            while True:
                msg = await self.ws.receive_text()
                try:
                    data = json.loads(msg)
                except json.JSONDecodeError:
                    continue

                if data.get("type") != "control":
                    continue

                cmd = str(data.get("cmd", "")).strip()
                value = data.get("value")

                if value is None or value == "":
                    line = f"{cmd}\n"
                else:
                    line = f"{cmd} {value}\n"

                try:
                    writer.write(line.encode("utf-8"))
                    await writer.drain()
                except (BrokenPipeError, ConnectionResetError):
                    break
        except WebSocketDisconnect:
            pass
        finally:
            with contextlib.suppress(Exception):
                writer.close()
                await writer.wait_closed()

    async def close(self):
        if self.closed: return
        self.closed = True

        tasks = [self.stdin_pump_task, self.read_stdout_task, self.batch_sender_task]
        for t in tasks:
            if t: t.cancel()
        await asyncio.gather(*(t for t in tasks if t), return_exceptions=True)

        if self.proc and self.proc.stdin and self.proc.returncode is None:
            with contextlib.suppress(Exception):
                self.proc.stdin.write(b"exit\n")
                await self.proc.stdin.drain()

        if self.proc:
            await kill_process_tree(self.proc, grace_s=1.0)

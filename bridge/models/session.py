from dataclasses import dataclass, field
from typing import Optional, List
import asyncio
import contextlib
from fastapi import WebSocket, WebSocketDisconnect

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
            stderr=asyncio.subprocess.STDOUT
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
                    self.out_queue.put_nowait(text)
                except asyncio.QueueFull:
                    pass
        except Exception as e:
            await self.out_queue.put(f"[SIM] <reader error: {e}>")

    async def _batch_sender(self):
        """Отправляет сообщения клиенту батчами в JSON: {"type":"batch","commands":[...]}"""
        try:
            buffer: List[str] = []
            flush_interval = FLUSH_INTERVAL_MS / 1000.0
            max_batch_size = 50

            last_flush = asyncio.get_event_loop().time()

            async def flush():
                nonlocal buffer, bytes_count, last_flush
                if not buffer:
                    return
                await self.ws.send_json({"type": "batch", "commands": list(map(convert_msg_to_dict, buffer))})
                buffer = []
                bytes_count = 0
                last_flush = asyncio.get_event_loop().time()

            while True:
                try:
                    get_task = asyncio.create_task(self.out_queue.get())
                    done, pending = await asyncio.wait(
                        {get_task},
                        timeout=flush_interval,
                        return_when=asyncio.FIRST_COMPLETED
                    )
                    if get_task in done:
                        line = get_task.result()
                        buffer.append(line)
                    else:
                        get_task.cancel()

                    now = asyncio.get_event_loop().time()
                    if len(buffer) >= max_batch_size or (now - last_flush) >= flush_interval:
                        await flush()

                    if self.proc and self.proc.returncode is not None and self.out_queue.empty():
                        break

                except WebSocketDisconnect:
                    break
        finally:
            pass

    async def _stdin_pump(self):
        """Слушает WS и отправляет всё в stdin симуляции."""
        assert self.proc and self.proc.stdin
        writer = self.proc.stdin
        try:
            while True:
                msg = await self.ws.receive_text()
                data = (msg + "\n").encode("utf-8")
                try:
                    writer.write(data)
                    await writer.drain()
                except (BrokenPipeError, ConnectionResetError):
                    break
        except WebSocketDisconnect:
            pass
        finally:
            with contextlib.suppress(Exception):
                writer.close()

    async def close(self):
        if self.closed:
            return
        self.closed = True

        for t in (self.stdin_pump_task, self.read_stdout_task, self.batch_sender_task):
            if t:
                t.cancel()

        if self.proc:
            await kill_process_tree(self.proc, grace_s=1.0)

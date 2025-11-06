import asyncio
import contextlib
import signal
import os


async def kill_process_tree(proc: asyncio.subprocess.Process, grace_s: float = 1.0):
    if proc.returncode is not None:
        return

    pgid = None
    with contextlib.suppress(Exception):
        pgid = os.getpgid(proc.pid)

    def term():
        if pgid:
            os.killpg(pgid, signal.SIGTERM)
        else:
            proc.terminate()

    def kill():
        if pgid:
            os.killpg(pgid, signal.SIGKILL)
        else:
            proc.kill()

    term()
    try:
        await asyncio.wait_for(proc.wait(), timeout=grace_s)
    except asyncio.TimeoutError:
        kill()
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(proc.wait(), timeout=grace_s)

    for stream in (proc.stdout, proc.stdin):
        with contextlib.suppress(Exception):
            if stream:
                stream.close()
                if hasattr(stream, "wait_closed"):
                    await stream.wait_closed()

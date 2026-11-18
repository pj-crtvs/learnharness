"""Manim Community Edition rendering service.

Isolated HTTP service that turns validated Manim scene source into MP4
artifacts. The main LearnHarness application talks to it through the
authenticated endpoints below; it never executes code inside the app
server.

Run:
    MANIM_RENDERER_SECRET=... MANIM_ARTIFACTS_DIR=... \\
        uvicorn main:app --host 127.0.0.1 --port 8765
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

SECRET = os.environ.get("MANIM_RENDERER_SECRET", "dev-secret")
ARTIFACTS_DIR = Path(os.environ.get("MANIM_ARTIFACTS_DIR", "./artifacts")).resolve()
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
JOBS_DIR = ARTIFACTS_DIR / "jobs"
JOBS_DIR.mkdir(parents=True, exist_ok=True)
TEMPLATES_DIR = Path(os.environ.get("MANIM_TEMPLATES_DIR", str(Path(__file__).parent / "templates"))).resolve()
TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)

QUALITY_FLAGS = {
    "preview": ["-ql", "--disable_caching"],
    "standard": ["-qm", "--disable_caching"],
    "high": ["-qh", "--disable_caching"],
}

DANGEROUS_TOKENS = [
    "import os",
    "import subprocess",
    "import sys",
    "import socket",
    "import shutil",
    "import requests",
    "import urllib",
    "__import__",
    "exec(",
    "eval(",
    "open(",
    "compile(",
]

app = FastAPI(title="LearnHarness Manim Renderer", version="0.1.0")


class RenderRequest(BaseModel):
    code: str = Field(..., min_length=1)
    quality: str = Field("preview")
    scene_name: Optional[str] = None
    timeout: int = Field(300, ge=10, le=1800)


class JobState(BaseModel):
    id: str
    status: str  # queued | running | done | failed | cancelled
    quality: str
    scene_name: Optional[str] = None
    progress: float = 0.0
    artifact_path: Optional[str] = None
    error: Optional[str] = None
    logs: str = ""
    created_at: float
    updated_at: float


_jobs: Dict[str, JobState] = {}
_procs: Dict[str, subprocess.Popen] = {}
_lock = threading.Lock()


def _auth(secret: Optional[str]) -> None:
    if secret != SECRET:
        raise HTTPException(status_code=401, detail="invalid renderer secret")


def _validate_code(code: str) -> None:
    low = code.lower()
    for tok in DANGEROUS_TOKENS:
        if tok in low:
            raise HTTPException(status_code=400, detail=f"disallowed token in code: {tok}")
    if "manim" not in low:
        raise HTTPException(status_code=400, detail="code must import manim")
    if not re.search(r"class\s+\w+\s*\(\s*[^)]*Scene[^)]*\)", code):
        raise HTTPException(status_code=400, detail="code must define a Scene subclass")
    # size cap
    if len(code) > 200_000:
        raise HTTPException(status_code=400, detail="code too large")


def _scene_name_from_code(code: str) -> Optional[str]:
    m = re.search(r"class\s+(\w+)\s*\(\s*[^)]*Scene[^)]*\)", code)
    return m.group(1) if m else None


def _persist(job: JobState) -> None:
    try:
        (JOBS_DIR / f"{job.id}.json").write_text(job.model_dump_json(indent=2), encoding="utf-8")
    except Exception:
        pass


def _load_jobs() -> None:
    for f in JOBS_DIR.glob("*.json"):
        try:
            j = JobState.model_validate_json(f.read_text(encoding="utf-8"))
            if j.status in ("queued", "running"):
                j.status = "failed"
                j.error = "renderer restarted"
                j.updated_at = time.time()
            _jobs[j.id] = j
        except Exception:
            continue


_load_jobs()


def _run_job(job_id: str, code: str, quality: str, scene_name: str, timeout: int) -> None:
    workdir = JOBS_DIR / job_id
    workdir.mkdir(parents=True, exist_ok=True)
    src_file = workdir / "scene.py"
    src_file.write_text(code, encoding="utf-8")

    with _lock:
        job = _jobs[job_id]
        job.status = "running"
        job.progress = 0.1
        job.updated_at = time.time()
        _persist(job)

    flags = QUALITY_FLAGS.get(quality, QUALITY_FLAGS["preview"])
    cmd = ["manim", *flags, "-o", f"{job_id}.mp4", str(src_file), scene_name]
    # media dir inside workdir so artifacts are contained
    cmd = ["manim", *flags, "--media_dir", str(workdir / "media"), "-o", f"{job_id}.mp4", str(src_file), scene_name]

    logs = ""
    proc = None
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(workdir),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        with _lock:
            _procs[job_id] = proc
        # stream output with timeout
        import threading as _t

        def _reader():
            nonlocal logs
            if proc.stdout is None:
                return
            for line in proc.stdout:
                logs += line
                # best-effort progress parse
                m = re.search(r"(\d+)%", line)
                if m:
                    try:
                        pct = float(m.group(1)) / 100.0
                        with _lock:
                            if job_id in _jobs:
                                _jobs[job_id].progress = max(_jobs[job_id].progress, pct)
                                _jobs[job_id].logs = logs[-8000:]
                                _jobs[job_id].updated_at = time.time()
                                _persist(_jobs[job_id])
                    except Exception:
                        pass

        rt = _t.Thread(target=_reader, daemon=True)
        rt.start()
        try:
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            raise TimeoutError(f"render exceeded {timeout}s")
        rt.join(timeout=5)

        if proc.returncode != 0:
            raise RuntimeError(f"manim exited {proc.returncode}\n{logs[-4000:]}")

        # find mp4
        mp4s = list(workdir.rglob("*.mp4"))
        if not mp4s:
            raise RuntimeError("no mp4 produced")
        # pick largest
        mp4 = max(mp4s, key=lambda p: p.stat().st_size)
        final = ARTIFACTS_DIR / f"{job_id}.mp4"
        shutil.copyfile(mp4, final)

        with _lock:
            job = _jobs[job_id]
            job.status = "done"
            job.progress = 1.0
            job.artifact_path = str(final)
            job.logs = logs[-8000:]
            job.updated_at = time.time()
            _persist(job)
    except Exception as e:
        with _lock:
            job = _jobs.get(job_id)
            if job is not None:
                if job.status != "cancelled":
                    job.status = "failed"
                job.error = str(e)
                job.logs = (logs or "")[-8000:]
                job.updated_at = time.time()
                _persist(job)
    finally:
        with _lock:
            _procs.pop(job_id, None)


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"ok": True, "manim": True, "artifacts": str(ARTIFACTS_DIR)}


@app.get("/templates")
def templates(x_renderer_secret: Optional[str] = Header(default=None, alias="X-Renderer-Secret")) -> Any:
    _auth(x_renderer_secret)
    out = []
    if TEMPLATES_DIR.exists():
        for f in TEMPLATES_DIR.glob("*.py"):
            out.append({"name": f.stem, "path": str(f)})
    return {"templates": out}


@app.post("/render")
def render(req: RenderRequest, x_renderer_secret: Optional[str] = Header(default=None, alias="X-Renderer-Secret")) -> Any:
    _auth(x_renderer_secret)
    _validate_code(req.code)
    if req.quality not in QUALITY_FLAGS:
        raise HTTPException(status_code=400, detail="unknown quality")
    scene = req.scene_name or _scene_name_from_code(req.code)
    if not scene:
        raise HTTPException(status_code=400, detail="could not determine scene name")
    job_id = uuid.uuid4().hex
    now = time.time()
    job = JobState(id=job_id, status="queued", quality=req.quality, scene_name=scene, created_at=now, updated_at=now)
    with _lock:
        _jobs[job_id] = job
        _persist(job)
    t = threading.Thread(target=_run_job, args=(job_id, req.code, req.quality, scene, req.timeout), daemon=True)
    t.start()
    return {"job_id": job_id, "scene_name": scene}


@app.get("/jobs/{job_id}")
def job_status(job_id: str, x_renderer_secret: Optional[str] = Header(default=None, alias="X-Renderer-Secret")) -> Any:
    _auth(x_renderer_secret)
    with _lock:
        job = _jobs.get(job_id)
    if job is None:
        # try disk
        p = JOBS_DIR / f"{job_id}.json"
        if p.exists():
            job = JobState.model_validate_json(p.read_text(encoding="utf-8"))
        else:
            raise HTTPException(status_code=404, detail="job not found")
    return job.model_dump()


@app.post("/jobs/{job_id}/cancel")
def cancel(job_id: str, x_renderer_secret: Optional[str] = Header(default=None, alias="X-Renderer-Secret")) -> Any:
    _auth(x_renderer_secret)
    with _lock:
        job = _jobs.get(job_id)
        proc = _procs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    if proc is not None:
        try:
            proc.kill()
        except Exception:
            pass
    with _lock:
        job.status = "cancelled"
        job.updated_at = time.time()
        _persist(job)
    return {"ok": True}


@app.get("/artifacts/{job_id}.mp4")
def artifact(job_id: str, x_renderer_secret: Optional[str] = Header(default=None, alias="X-Renderer-Secret")) -> Any:
    _auth(x_renderer_secret)
    path = ARTIFACTS_DIR / f"{job_id}.mp4"
    if not path.exists():
        raise HTTPException(status_code=404, detail="artifact not found")
    return FileResponse(path, media_type="video/mp4", filename=f"{job_id}.mp4")

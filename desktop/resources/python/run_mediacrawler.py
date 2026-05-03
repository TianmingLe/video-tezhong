import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path


def _write_event(fp: Path, ev: dict) -> None:
    fp.parent.mkdir(parents=True, exist_ok=True)
    with fp.open("a", encoding="utf-8") as f:
        f.write(json.dumps(ev, ensure_ascii=False) + "\n")


def _pick_task_json(argv: list[str]) -> str:
    p = argparse.ArgumentParser(add_help=False)
    p.add_argument("--task-json", dest="task_json")
    ns, rest = p.parse_known_args(argv)
    if ns.task_json:
        return ns.task_json
    if rest:
        return rest[0]
    raise SystemExit("task.json path is required")


def _copy_first_md(run_dir: Path) -> None:
    results_dir = run_dir / "results"
    if not results_dir.exists():
        return
    md_files = list(results_dir.rglob("*.md"))
    md_files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    if not md_files:
        return
    src = md_files[0]
    dst = run_dir / src.name
    try:
        shutil.copyfile(src, dst)
        print(f"[OMNI] report={dst.as_posix()}")
    except Exception:
        return


def _copy_analysis_json(run_dir: Path) -> None:
    runs_dir = run_dir / "results" / "runs"
    if not runs_dir.exists():
        return
    run_dirs = [p for p in runs_dir.iterdir() if p.is_dir()]
    if not run_dirs:
        return
    run_dirs.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    newest = run_dirs[0]
    files = list(newest.glob("mvp_analysis_*.json"))
    files.sort()
    if not files:
        return
    copied = 0
    for src in files[:50]:
        dst = run_dir / src.name
        try:
            shutil.copyfile(src, dst)
            copied += 1
        except Exception:
            continue
    if copied:
        print(f"[OMNI] analysis_copied={copied}")


def main() -> int:
    task_json_path = _pick_task_json(sys.argv[1:])
    task = json.loads(Path(task_json_path).read_text(encoding="utf-8"))

    run_id = str(task.get("runId") or "").strip()
    kind = str(task.get("kind") or "").strip()
    media_root = str(task.get("mediaCrawlerRoot") or "").strip()
    run_dir = str(task.get("runDir") or "").strip()
    args = task.get("args") or {}

    if not run_id:
        raise SystemExit("runId is required")
    if not media_root:
        raise SystemExit("mediaCrawlerRoot is required")
    if not run_dir:
        raise SystemExit("runDir is required")

    run_dir_p = Path(run_dir)
    run_dir_p.mkdir(parents=True, exist_ok=True)
    events_path = run_dir_p / "events.jsonl"

    _write_event(events_path, {"ts": int(time.time() * 1000), "type": "start", "runId": run_id, "kind": kind})

    specified_id = str(args.get("specifiedId") or "").strip()
    keywords = str(args.get("keywords") or "").strip()
    limit = args.get("limit")
    enable_llm = bool(args.get("enableLlm") or False)

    cmd = [sys.executable, "-u", os.path.join(media_root, "main.py"), "--pipeline", "mvp"]

    if kind == "dy_mvp":
        if not specified_id:
            raise SystemExit("specifiedId is required")
        cmd += ["--platform", "dy", "--type", "detail", "--specified_id", specified_id]
    elif kind == "xhs_search":
        if not keywords:
            raise SystemExit("keywords is required")
        cmd += ["--platform", "xhs", "--type", "search", "--keywords", keywords]
        if isinstance(limit, int):
            cmd += ["--limit", str(limit)]
    elif kind == "bili_search":
        if not keywords:
            raise SystemExit("keywords is required")
        cmd += ["--platform", "bili", "--type", "search", "--keywords", keywords]
        if isinstance(limit, int):
            cmd += ["--limit", str(limit)]
    else:
        raise SystemExit(f"unknown kind: {kind}")

    if enable_llm:
        llm_model = str(args.get("llmModel") or "").strip()
        llm_base_url = str(args.get("llmBaseUrl") or "").strip()
        llm_api_key = str(args.get("llmApiKey") or "").strip()
        if llm_model and llm_base_url:
            cmd += ["--enable_llm", "--llm_model", llm_model, "--llm_base_url", llm_base_url]
            if llm_api_key:
                cmd += ["--llm_api_key", llm_api_key]
        else:
            print("[OMNI] enableLlm=true but llmModel/llmBaseUrl missing, run without LLM")

    cmd_display = list(cmd)
    if "--llm_api_key" in cmd_display:
        i = cmd_display.index("--llm_api_key")
        if i + 1 < len(cmd_display):
            cmd_display[i + 1] = "***"
    print(f"[OMNI] runId={run_id} cmd={' '.join(cmd_display)} cwd={run_dir_p.as_posix()}")

    proc = subprocess.Popen(
        cmd,
        cwd=run_dir_p.as_posix(),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    assert proc.stdout is not None
    for line in proc.stdout:
        line = line.rstrip("\n")
        if line:
            print(line)
            _write_event(events_path, {"ts": int(time.time() * 1000), "type": "log", "line": line})

    code = proc.wait()
    _write_event(events_path, {"ts": int(time.time() * 1000), "type": "exit", "code": code})

    _copy_analysis_json(run_dir_p)
    _copy_first_md(run_dir_p)

    return int(code or 0)


if __name__ == "__main__":
    raise SystemExit(main())

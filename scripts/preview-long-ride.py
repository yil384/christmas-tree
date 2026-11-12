#!/usr/bin/env python3
"""Prepare a fully verified 720p QA entry while the main build encodes 1080p.

Run alongside build-long-ride.py. It waits for that build's verified master,
encodes into a separate directory, and only installs a complete rendition.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import time

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("long_ride_builder", Path(__file__).with_name("build-long-ride.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work-dir", type=Path, default=Path("/workspace/shared/long-castle-ride/build"))
    parser.add_argument("--edit-list", type=Path, default=Path("/workspace/shared/long-castle-ride/edit-list.json"))
    parser.add_argument("--output-dir", type=Path, default=m.REPO / "public/journey/film")
    parser.add_argument("--count", type=int, default=18)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--master-preset", default="fast")
    parser.add_argument("--hls-preset", default="medium")
    parser.add_argument("--wait-seconds", type=int, default=2400)
    args = parser.parse_args()
    edits = m.read_edits(args)
    report = json.loads((args.work_dir / "source-report.json").read_text())
    by_file = {s["file"]: s for s in report["sources"]}
    signature = m.digest([m.VERSION, report["ffmpeg"], edits,
                          [by_file[e["file"]]["sha256"] for e in edits],
                          args.master_preset, args.hls_preset, m.VARIANTS])
    timeline = json.loads((args.work_dir / "planned-timeline.json").read_text())
    if timeline["durationFrames"] != m.timeline_for(edits)["durationFrames"]:
        raise ValueError("The plan and edit list do not match")
    master = args.work_dir / "master-1080p.mkv"
    stamp = master.with_suffix(".json")
    deadline = time.monotonic() + args.wait_seconds
    print(f"Waiting for verified master {signature}; no active encoding files will be touched.", flush=True)
    while True:
        if master.exists() and stamp.exists():
            ready = json.loads(stamp.read_text())
            if ready["signature"] == signature and ready["frames"] == timeline["durationFrames"]:
                break
        if time.monotonic() > deadline:
            raise RuntimeError("Timed out waiting for the matching verified master")
        time.sleep(2)
    run = m.Runner(args.work_dir, args.threads)
    m.VARIANTS = tuple(v for v in m.VARIANTS if v["name"] == "720p")
    qa, reports = m.encode_hls(run, master, timeline, signature + "-qa", args.hls_preset)
    formal = args.work_dir / f"hls-{signature}"
    formal.mkdir(parents=True, exist_ok=True)
    reuse = formal / "720p"
    copied = args.work_dir / f"verified-720-{signature}.installing"
    installed = False
    if not reuse.exists():
        if copied.exists():
            shutil.rmtree(copied)
        shutil.copytree(qa / "720p", copied)
        # GNU mv uses no-replace rename semantics here, including an existing
        # empty destination directory. Never replace a directory owned by the
        # main encoder if it reaches 720p at the same moment.
        result = subprocess.run(["mv", "--no-clobber", "-T", "--", str(copied), str(reuse)],
                                capture_output=True, text=True)
        installed = not copied.exists() and reuse.exists()
        if copied.exists():
            shutil.rmtree(copied)
        if result.returncode and not reuse.exists():
            raise RuntimeError(f"Could not install verified 720p rendition: {result.stderr}")
    qa_master = (qa / "index.m3u8").read_text()
    (qa / "index-qa.m3u8").write_text(qa_master)
    (formal / "index-qa.m3u8").write_text(qa_master)
    # VOD playlists are written only after the encode ends. If 1080p is already
    # complete, let the main process publish; do not race its directory swap.
    if not (formal / "1080p/index.m3u8").exists():
        m.publish_local(qa, args.output_dir, args.work_dir)
        status = "720p QA entry ready; final master will replace it with two renditions"
    else:
        status = "720p verified and staged; 1080p encoding is complete, so final publication owns the directory"
    result = {"status": status, "signature": signature, "reusedByMainBuild": installed,
              "qaEntry": "/journey/film/index-qa.m3u8", "duration": timeline["duration"],
              "frames": timeline["durationFrames"], "rendition": reports["720p"]}
    m.write_json(args.work_dir / "qa-preview-report.json", result)
    print(json.dumps(result, indent=2), flush=True)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)

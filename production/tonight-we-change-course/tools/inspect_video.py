#!/usr/bin/env python3
"""Inspect a downloaded local clip and extract exact first/middle/last frames."""
import argparse
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import shutil
import subprocess


def command(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=120)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or f"Command failed: {args[0]}")
    return result.stdout


def number(value):
    try:
        return float(Fraction(str(value)))
    except (ValueError, ZeroDivisionError):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("clip", type=Path)
    parser.add_argument("output_directory", type=Path)
    parser.add_argument("--expected-duration", type=float)
    parser.add_argument("--expected-width", type=int)
    parser.add_argument("--expected-height", type=int)
    parser.add_argument("--expected-fps", type=float)
    args = parser.parse_args()
    clip = args.clip.resolve(strict=True)
    if not clip.is_file():
        raise ValueError("Input must be a regular local video file")
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise RuntimeError("ffmpeg and ffprobe are required")
    output = args.output_directory.resolve()
    output.mkdir(parents=True, exist_ok=True)
    if (output / "qa-report.json").exists():
        raise ValueError("Choose a fresh output directory; existing QA reports are preserved")
    probe = json.loads(command([
        "ffprobe", "-v", "error", "-count_frames", "-show_streams",
        "-show_format", "-of", "json", str(clip),
    ]))
    videos = [s for s in probe.get("streams", []) if s.get("codec_type") == "video"]
    if not videos:
        raise ValueError("No video stream found")
    stream = videos[0]
    fps = number(stream.get("avg_frame_rate")) or number(stream.get("r_frame_rate"))
    frames = int(stream.get("nb_read_frames") or stream.get("nb_frames") or 0)
    if frames < 1 or not fps:
        raise ValueError("Unable to establish decoded frame count and frame rate")
    duration = number(stream.get("duration"))
    frame_duration = frames / fps
    selected = sorted(set([0, frames // 2, frames - 1]))
    select_filter = "select=" + "+".join(f"eq(n\\,{n})" for n in selected)
    command([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-n",
        "-i", str(clip), "-map", "0:v:0", "-vf", select_filter,
        "-fps_mode", "vfr", "-frames:v", str(len(selected)),
        str(output / "frame-%02d.png"),
    ])
    frame_files = {n: str(output / f"frame-{i+1:02d}.png") for i, n in enumerate(selected)}
    for path in frame_files.values():
        if not Path(path).is_file():
            raise RuntimeError("Expected extracted frame is missing")
    checks = {}
    expected = {
        "duration_seconds": (args.expected_duration, frame_duration, 0.1),
        "width": (args.expected_width, stream.get("width"), 0),
        "height": (args.expected_height, stream.get("height"), 0),
        "fps": (args.expected_fps, fps, 0.01),
    }
    for key, (want, actual, tolerance) in expected.items():
        if want is not None:
            checks[key] = {"expected": want, "actual": actual,
                           "pass": actual is not None and abs(actual-want) <= tolerance}
    digest = hashlib.sha256()
    with clip.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    report = {
        "status": "metadata_checked_visual_review_required",
        "checked_at_utc": datetime.now(timezone.utc).isoformat(),
        "input_file": str(clip), "input_bytes": clip.stat().st_size,
        "input_sha256": digest.hexdigest(),
        "video": {
            "codec": stream.get("codec_name"), "width": stream.get("width"),
            "height": stream.get("height"), "fps": fps, "decoded_frames": frames,
            "stream_duration_seconds": duration,
            "frame_count_duration_seconds": frame_duration,
            "container_duration_seconds": number(probe.get("format", {}).get("duration")),
        },
        "audio_streams": [{"codec": s.get("codec_name"), "channels": s.get("channels"),
                           "duration_seconds": number(s.get("duration"))}
                          for s in probe.get("streams", []) if s.get("codec_type") == "audio"],
        "expected_checks": checks,
        "metadata_matches_requested_spec": all(c["pass"] for c in checks.values()) if checks else None,
        "frames": [{"label": label, "index": index, "approx_time_seconds": index/fps,
                    "file": frame_files[index]}
                   for label, index in [("first", 0), ("middle", frames//2), ("last", frames-1)]],
        "visual_approval": None,
        "limitations": ["Metadata and sampled frames do not certify face consistency, cat motion, or audio content.",
                        "Full clip playback and human visual/audio review remain necessary."],
    }
    (output / "ffprobe.json").write_text(json.dumps(probe, indent=2) + "\n")
    (output / "qa-report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

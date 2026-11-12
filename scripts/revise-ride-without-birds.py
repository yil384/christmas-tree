#!/usr/bin/env python3
"""Remove the reviewed [88.5, 114.0) interval from the existing 228.5 s film.

This is an edit of the OLD film, not a newly generated five-minute story.
Builds outside public first; --apply replaces the local film only after both
HLS variants have been fully decoded and checked. It never deploys a Site.
The original 1080p source is snapshotted in --work-dir for reproducibility.
"""
from __future__ import annotations

import argparse
from fractions import Fraction
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys

REPO = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("ride_pipeline", REPO / "scripts/build-long-ride.py")
pipeline = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pipeline)

REVISION = "birdfree-r1"
VERSION = "old-film-bird-removal-v1"
FPS = 24
ORIGINAL_FRAMES = 5484
CUT_START = 2124  # 88.5 s, first frame of the incoming shot-8 dissolve.
CUT_END = 2736    # 114.0 s, first fully clear shot-10 frame.
EXPECTED_FRAMES = ORIGINAL_FRAMES - (CUT_END - CUT_START)
KEEP_RANGES = ((0, CUT_START), (CUT_END, ORIGINAL_FRAMES))


def revised_timeline(original: dict) -> dict:
    if original["fps"] != FPS or original["durationFrames"] != ORIGINAL_FRAMES:
        raise ValueError("Expected the original 228.5 s / 5,484-frame timeline; refusing to cut an already revised film")
    segments = []
    output_offset = 0
    for keep_start, keep_end in KEEP_RANGES:
        shift = keep_start - output_offset
        for source in original["segments"]:
            begin = max(source["startFrame"], keep_start)
            end = min(source["endFrame"], keep_end)
            if begin >= end:
                continue
            solid_begin = max(begin, min(end, round(source["solidStart"] * FPS)))
            solid_end = max(solid_begin, min(end, round(source["solidEnd"] * FPS)))
            source_begin = source["sourceInFrame"] + begin - source["startFrame"]
            source_end = source["sourceInFrame"] + end - source["startFrame"]
            head, tail = solid_begin - begin, end - solid_end
            segments.append({
                **source,
                "sourceIn": source_begin / FPS, "sourceOut": source_end / FPS,
                "sourceInFrame": source_begin, "sourceOutFrame": source_end,
                "start": (begin - shift) / FPS, "end": (end - shift) / FPS,
                "startFrame": begin - shift, "endFrame": end - shift,
                "duration": (end - begin) / FPS,
                "overlapIn": head / FPS, "overlapOut": tail / FPS,
                "solidStart": (solid_begin - shift) / FPS,
                "solidEnd": (solid_end - shift) / FPS,
                "transitionOut": "dissolve" if tail else "cut",
            })
        output_offset += keep_end - keep_start
    segments[-1]["transitionOut"] = "end"
    if [s["shotId"] for s in segments] != list(range(1, 8)) + list(range(10, 19)):
        raise ValueError("Unexpected retained shot IDs")
    for previous, current in zip(segments, segments[1:]):
        if previous["endFrame"] - current["startFrame"] != round(previous["overlapOut"] * FPS):
            raise ValueError("Retained shot timing is discontinuous")
        if previous["overlapOut"] != current["overlapIn"]:
            raise ValueError("Retained overlap metadata disagrees")
    if output_offset != EXPECTED_FRAMES or segments[-1]["endFrame"] != EXPECTED_FRAMES:
        raise ValueError("Revised timeline must be exactly 4,872 frames")
    finale = original.get("finaleDuration", 90)
    return {
        "version": 2, "revision": REVISION, "fps": FPS,
        "duration": EXPECTED_FRAMES / FPS, "durationFrames": EXPECTED_FRAMES,
        "crossfadeDuration": max(s["overlapOut"] for s in segments),
        "transitionPolicy": "Existing dissolves retained; hard cut at 88.5 s removes original [88.5,114.0)",
        "segments": segments,
        "finaleDuration": finale,
        "totalExperienceDuration": EXPECTED_FRAMES / FPS + finale,
    }


def snapshot_input(source: Path, work: Path) -> tuple[Path, dict, dict]:
    snapshot = work / "original-film"
    if not snapshot.exists():
        original = json.loads((source / "timeline.json").read_text())
        revised_timeline(original)  # Fail before copying if this is not the old film.
        temp = work / "original-film.copying"
        if temp.exists():
            shutil.rmtree(temp)
        temp.mkdir(parents=True)
        shutil.copytree(source / "1080p", temp / "1080p")
        shutil.copy2(source / "timeline.json", temp / "timeline.json")
        manifest = {str(path.relative_to(temp)): {"bytes": path.stat().st_size, "sha256": pipeline.file_hash(path)}
                    for path in sorted(temp.rglob("*")) if path.is_file()}
        pipeline.write_json(temp / "source-manifest.json", manifest)
        temp.replace(snapshot)
    original = json.loads((snapshot / "timeline.json").read_text())
    manifest = json.loads((snapshot / "source-manifest.json").read_text())
    for name, record in manifest.items():
        path = snapshot / name
        if path.stat().st_size != record["bytes"] or pipeline.file_hash(path) != record["sha256"]:
            raise ValueError(f"Original snapshot changed: {name}")
    return snapshot, original, manifest


def check_master(path: Path, expected_frames: int) -> dict:
    info = pipeline.probe(path, count_frames=True)
    video, audio = pipeline.stream(info, "video"), pipeline.stream(info, "audio")
    actual_frames = int(video["nb_read_frames"])
    actual_samples = pipeline.pcm_samples(path)
    if actual_frames != expected_frames or Fraction(video["avg_frame_rate"]) != FPS:
        raise ValueError(f"Unexpected decoded video length/rate: {path}")
    if (video["width"], video["height"]) != (1080, 1920):
        raise ValueError(f"Unexpected master resolution: {path}")
    if audio["codec_name"] != "pcm_s16le" or int(audio["sample_rate"]) != 48000 or actual_samples != expected_frames * 2000:
        raise ValueError(f"Unexpected exact PCM sample count: {path}")
    if abs(float(info["format"]["duration"]) - expected_frames / FPS) > 1 / FPS:
        raise ValueError(f"Unexpected master duration: {path}")
    return {"frames": actual_frames, "pcmSamples": actual_samples,
            "duration": expected_frames / FPS, "bytes": path.stat().st_size,
            "sha256": pipeline.file_hash(path)}


def build_cut_master(run, source: Path, signature: str, preset: str) -> tuple[Path, dict]:
    master = run.work / "revised-1080p.mkv"
    stamp = master.with_suffix(".json")
    if master.exists() and stamp.exists() and json.loads(stamp.read_text()).get("signature") == signature:
        return master, check_master(master, EXPECTED_FRAMES)
    info = pipeline.probe(source)
    video, audio = pipeline.stream(info, "video"), pipeline.stream(info, "audio")
    if (video["width"], video["height"]) != (1080, 1920) or Fraction(video["avg_frame_rate"]) != FPS:
        raise ValueError("Expected the existing native 1080x1920 / 24 fps HLS source")
    if int(audio["sample_rate"]) != 48000:
        raise ValueError("Expected 48 kHz HLS audio")
    # MPEG-TS keeps AAC's leading encoder packet. Align audio sample zero to
    # video frame zero before applying the same reviewed time window to both.
    offset = (Fraction(video["start_time"]) - Fraction(audio["start_time"])) * 48000
    audio_origin = round(offset)
    if audio_origin < 0 or abs(float(offset - audio_origin)) > 0.51:
        raise ValueError("Unclear audio/video origin alignment")
    parts = []
    for index, (begin, end) in enumerate(KEEP_RANGES):
        length = end - begin
        part = run.work / f"retained-{index + 1}-{signature}.mkv"
        if not part.exists():
            audio_cut = (f"asetpts=N/SR/TB,atrim=start_sample={audio_origin + begin * 2000}:"
                         f"end_sample={audio_origin + end * 2000},asetpts=N/SR/TB")
            # 12 ms amplitude ramps prevent a splice click; they add no time.
            audio_cut += (f",afade=t=out:st={length / FPS - .012:.9f}:d=0.012" if index == 0
                          else ",afade=t=in:st=0:d=0.012")
            graph = pipeline.video_range(0, begin, end, "v") + f";[0:a]{audio_cut}[a]"
            temp = part.with_name(part.stem + ".partial.mkv")
            run.run(run.ffmpeg() + run.input(source) + [
                "-filter_complex", graph, "-map", "[v]", "-map", "[a]",
                "-c:v", "libx264", "-preset", preset, "-crf", "16", "-profile:v", "high",
                "-level:v", "4.1", "-pix_fmt", "yuv420p", "-threads", str(run.threads),
                "-r", "24", "-fps_mode", "cfr", "-enc_time_base:v", "1:24",
                "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
                "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", str(temp)],
                f"retain-original-{begin}-{end}")
            check_master(temp, length)
            temp.replace(part)
        parts.append((part, length))
    listing = run.work / "revised.ffconcat"
    listing.write_text("ffconcat version 1.0\n" + "".join(
        f"file {pipeline.ffconcat_path(path)}\nduration {pipeline.seconds(length)}\n" for path, length in parts))
    temp = master.with_name(master.stem + ".partial.mkv")
    run.run(run.ffmpeg() + ["-f", "concat", "-safe", "0", "-i", str(listing),
                           "-map", "0:v:0", "-map", "0:a:0", "-c", "copy", str(temp)], "join-retained-film")
    result = check_master(temp, EXPECTED_FRAMES)
    temp.replace(master)
    pipeline.write_json(stamp, {"signature": signature, "audioOriginSamples": audio_origin, **result})
    return master, result


def version_playlist_paths(staging: Path) -> None:
    """New names prevent a prior viewer from reusing cached bird-scene segments."""
    for variant in pipeline.VARIANTS:
        directory = staging / variant["name"]
        playlist = directory / "index.m3u8"
        lines = playlist.read_text().splitlines()
        updated = []
        for line in lines:
            if line and not line.startswith("#") and not line.startswith(REVISION + "-"):
                new_name = REVISION + "-" + line
                (directory / line).rename(directory / new_name)
                line = new_name
            updated.append(line)
        content = "\n".join(updated) + "\n"
        playlist.write_text(content)
        (directory / f"index-{REVISION}.m3u8").write_text(content)
    master = (staging / "index.m3u8").read_text()
    for variant in pipeline.VARIANTS:
        master = master.replace(f"{variant['name']}/index.m3u8", f"{variant['name']}/index-{REVISION}.m3u8")
    (staging / "index.m3u8").write_text(master)
    (staging / f"index-{REVISION}.m3u8").write_text(master)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-film-dir", type=Path, default=REPO / "public/journey/film")
    parser.add_argument("--work-dir", type=Path, required=True)
    parser.add_argument("--apply", action="store_true", help="Replace local public media and source timeline after verification; no deployment")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--master-preset", default="fast")
    parser.add_argument("--hls-preset", default="medium")
    args = parser.parse_args()
    if args.threads < 1:
        raise ValueError("--threads must be positive")
    work = args.work_dir.resolve()
    if work == REPO or REPO in work.parents:
        raise ValueError("Use a work directory outside the repository")
    work.mkdir(parents=True, exist_ok=True)
    snapshot, original, manifest = snapshot_input(args.source_film_dir, work)
    timeline = revised_timeline(original)
    signature = pipeline.digest([VERSION, manifest, KEEP_RANGES, args.master_preset, args.hls_preset, pipeline.VARIANTS])
    run = pipeline.Runner(work, args.threads)
    master, master_report = build_cut_master(run, snapshot / "1080p/index.m3u8", signature, args.master_preset)
    staging, variants = pipeline.encode_hls(run, master, timeline, signature, args.hls_preset)
    version_playlist_paths(staging)
    # encode_hls already completely decoded both variants. Renaming changes no
    # media bytes; resolve every renamed URI before making the local replacement.
    for variant in pipeline.VARIANTS:
        directory = staging / variant["name"]
        for line in (directory / f"index-{REVISION}.m3u8").read_text().splitlines():
            if line and not line.startswith("#") and not (directory / line).is_file():
                raise ValueError(f"Unresolved revised segment URI: {line}")
    original_bytes = sum(record["bytes"] for name, record in manifest.items() if name.endswith(".ts"))
    report = {
        "revision": REVISION, "kind": "old-film-bird-removal", "newStoryFilmGenerated": False,
        "originalDuration": ORIGINAL_FRAMES / FPS, "removedInterval": [88.5, 114.0],
        "removedFrames": CUT_END - CUT_START, "duration": timeline["duration"],
        "durationFrames": EXPECTED_FRAMES, "finaleDuration": timeline["finaleDuration"],
        "totalExperienceDuration": timeline["totalExperienceDuration"],
        "removedShotIds": [8, 9], "retainedShotIds": [s["shotId"] for s in timeline["segments"]],
        "sourceManifest": manifest, "source1080pSegmentBytes": original_bytes,
        "sourceSnapshot": str(snapshot), "master": master_report, "variants": variants,
        "masterPlaylist": f"journey/film/index-{REVISION}.m3u8",
        "signature": signature, "ffmpeg": subprocess.check_output(["ffmpeg", "-version"], text=True).splitlines()[0],
        "commands": str(work / "commands.jsonl"), "appliedLocally": False,
        "note": "An edit of existing footage. No new story shots, extended runtime, loops, still padding, or speed changes.",
    }
    pipeline.write_json(work / "revision-report.json", report)
    pipeline.write_json(work / "revised-timeline.json", timeline)
    if args.apply:
        pipeline.publish_local(staging, REPO / "public/journey/film", work)
        pipeline.write_json(REPO / "src/journey/rideTimeline.json", timeline)
        report["appliedLocally"] = True
        pipeline.write_json(work / "revision-report.json", report)
        pipeline.write_json(REPO / "docs/LONG_RIDE_BIRD_REMOVAL_REPORT.json", report)
    print(json.dumps({"duration": timeline["duration"], "frames": EXPECTED_FRAMES,
                      "variants": variants, "appliedLocally": args.apply,
                      "report": str(work / "revision-report.json")}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, RuntimeError, OSError, subprocess.CalledProcessError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)

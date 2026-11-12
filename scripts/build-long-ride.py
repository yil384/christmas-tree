#!/usr/bin/env python3
"""Assemble real 24 fps portrait shots into a bounded-memory castle-ride film.

Only real source trims, explicit hard cuts or dissolves, and audio normalization
are used. Legacy edits retain their default 15 s range and 0.5 s dissolves.
Longer real sources (including Extend exports) may use explicit out/outFrame.
There is no video loop, interpolation, still-frame padding, or speed change.
See docs/LONG_RIDE_VIDEO_PIPELINE.md for the exact media and delivery settings.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from fractions import Fraction

REPO = Path(__file__).resolve().parents[1]
FPS = 24
OVERLAP_FRAMES = 12
SAMPLE_RATE = 48000
VERSION = "long-ride-v4-variable-sources"
MAX_SEGMENT_BYTES = 25 * 1024 * 1024
VARIANTS = (
    {"name": "1080p", "width": 1080, "height": 1920, "rate": "3500k",
     "maxrate": "4200k", "bufsize": "8400k", "level": "4.1", "codec": "avc1.640029"},
    {"name": "720p", "width": 720, "height": 1280, "rate": "1700k",
     "maxrate": "2200k", "bufsize": "4400k", "level": "3.1", "codec": "avc1.64001f"},
)


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    temp.replace(path)


def digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()[:20]


def file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while block := f.read(2 * 1024 * 1024):
            h.update(block)
    return h.hexdigest()


def frames(seconds: object, name: str) -> int:
    value = Fraction(str(seconds)) * FPS
    if value.denominator != 1:
        raise ValueError(f"{name}={seconds} is not aligned to 1/{FPS} s; use inFrame/outFrame")
    return int(value)


def integer(value: object, name: str) -> int:
    """Do not silently truncate fractional frame indexes or shot identifiers."""
    if isinstance(value, bool):
        raise ValueError(f"{name} must be an integer, not a boolean")
    try:
        number = Fraction(str(value))
    except (ValueError, ZeroDivisionError) as error:
        raise ValueError(f"{name} must be a finite integer") from error
    if number.denominator != 1:
        raise ValueError(f"{name} must be an integer")
    return int(number)


def seconds(count: int) -> str:
    return f"{count / FPS:.9f}"


def probe(path: Path, count_frames: bool = False) -> dict:
    command = ["ffprobe", "-v", "error"]
    if count_frames:
        command += ["-count_frames"]
    command += ["-show_streams", "-show_format", "-of", "json", str(path)]
    result = subprocess.run(command, text=True, capture_output=True, check=True)
    return json.loads(result.stdout)


def stream(info: dict, kind: str) -> dict:
    found = [s for s in info["streams"] if s["codec_type"] == kind]
    if not found:
        raise ValueError(f"Missing {kind} stream")
    return found[0]


def pcm_samples(path: Path) -> int:
    result = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0",
                             "-show_entries", "packet=size", "-of", "csv=p=0", str(path)],
                            text=True, capture_output=True, check=True)
    # All intermediate/master audio is stereo, 16-bit PCM: four payload bytes per sample frame.
    return sum(int(line.strip()) for line in result.stdout.splitlines() if line.strip()) // 4


class Runner:
    def __init__(self, work: Path, threads: int):
        self.work = work
        self.threads = threads
        self.logs = work / "logs"
        self.logs.mkdir(parents=True, exist_ok=True)

    def run(self, args: list, label: str, capture: bool = False) -> str:
        command = [str(x) for x in args]
        print(label, flush=True)
        with (self.work / "commands.jsonl").open("a") as log:
            log.write(json.dumps({"at": dt.datetime.now(dt.timezone.utc).isoformat(),
                                  "step": label, "command": command}) + "\n")
        result = subprocess.run(command, text=True, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE)
        logfile = self.logs / (re.sub(r"[^a-zA-Z0-9_.-]+", "-", label) + ".log")
        logfile.write_text(result.stderr + result.stdout)
        if result.returncode:
            raise RuntimeError(f"{label} failed; see {logfile}\n{result.stderr[-4000:]}")
        return result.stderr + result.stdout if capture else ""

    def ffmpeg(self) -> list:
        return ["ffmpeg", "-hide_banner", "-nostdin", "-y", "-loglevel", "warning",
                "-filter_threads", "1", "-filter_complex_threads", "1"]

    def input(self, path: Path) -> list:
        return ["-threads", str(self.threads), "-i", str(path)]


def read_edits(args: argparse.Namespace) -> list[dict]:
    if args.edit_list:
        data = json.loads(args.edit_list.read_text())
        entries = data.get("clips") if isinstance(data, dict) else data
    else:
        entries = [{"id": n, "in": 0, "out": 15} for n in range(1, args.count + 1)]
    if not isinstance(entries, list) or not entries:
        raise ValueError("The edit list must be a nonempty array, or an object with a nonempty clips array")
    edits, ids = [], set()
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError("Each edit must be an object")
        shot_id = integer(entry.get("id"), "shot id")
        if shot_id < 1:
            raise ValueError("Shot ids must be positive")
        if shot_id in ids:
            raise ValueError(f"Shot {shot_id} occurs twice; repeated footage is not permitted")
        ids.add(shot_id)
        filename = entry.get("file", f"clip-{shot_id:02d}.mp4")
        if not isinstance(filename, str) or not filename or Path(filename).name != filename or "\\" in filename:
            raise ValueError("Each file must be a filename inside --input-dir")
        begin = integer(entry["inFrame"], "inFrame") if "inFrame" in entry else frames(entry.get("in", 0), "in")
        end = integer(entry["outFrame"], "outFrame") if "outFrame" in entry else frames(entry.get("out", 15), "out")
        if not 0 <= begin < end:
            raise ValueError(f"Invalid source range for shot {shot_id}: {begin}:{end}")
        transition = entry.get("transitionOut", "dissolve")
        if transition not in ("cut", "dissolve"):
            raise ValueError(f"Shot {shot_id}: transitionOut must be cut or dissolve")
        overlap = integer(entry.get("dissolveFrames", OVERLAP_FRAMES if transition == "dissolve" else 0),
                          "dissolveFrames")
        if (transition == "cut" and overlap != 0) or (transition == "dissolve" and overlap <= 0):
            raise ValueError(f"Shot {shot_id}: cut requires 0 overlap; dissolve requires a positive overlap")
        edits.append({"id": shot_id, "file": filename, "inFrame": begin,
                      "outFrame": end, "frames": end - begin,
                      "transitionOut": transition, "dissolveFrames": overlap})
    for index, edit in enumerate(edits):
        head = overlap_after(edits, index - 1)
        tail = overlap_after(edits, index)
        if edit["frames"] <= head + tail:
            raise ValueError(f"Shot {edit['id']} has no independent frame after its incoming/outgoing dissolves")
    return edits


def overlap_after(edits: list[dict], index: int) -> int:
    """A transition belongs to the outgoing shot; there is none at either end."""
    if index < 0 or index >= len(edits) - 1:
        return 0
    return edits[index].get("dissolveFrames", OVERLAP_FRAMES)


def timeline_for(edits: list[dict]) -> dict:
    position, segments = 0, []
    for index, edit in enumerate(edits):
        end = position + edit["frames"]
        head = overlap_after(edits, index - 1)
        tail = overlap_after(edits, index)
        segments.append({
            "shotId": edit["id"], "file": edit["file"],
            "sourceIn": edit["inFrame"] / FPS, "sourceOut": edit["outFrame"] / FPS,
            "start": position / FPS, "end": end / FPS, "duration": edit["frames"] / FPS,
            "startFrame": position, "endFrame": end,
            "sourceInFrame": edit["inFrame"], "sourceOutFrame": edit["outFrame"],
            "overlapIn": head / FPS, "overlapOut": tail / FPS,
            "transitionOut": "end" if index == len(edits) - 1 else "dissolve" if tail else "cut",
            "solidStart": (position + head) / FPS, "solidEnd": (end - tail) / FPS,
        })
        position = end - tail
    total = segments[-1]["endFrame"]
    max_overlap = max(segment["overlapOut"] for segment in segments)
    return {"version": 2, "fps": FPS, "duration": total / FPS,
            "durationFrames": total, "crossfadeDuration": max_overlap,
            "transitionPolicy": "per-boundary; crossfadeDuration is the maximum, segment overlaps are authoritative",
            "segments": segments}


def inspect_source(path: Path, edit: dict) -> dict:
    info = probe(path)
    video, audio = stream(info, "video"), stream(info, "audio")
    if (video["width"], video["height"]) != (1080, 1920):
        raise ValueError(f"{path.name}: expected native 1080x1920, got {video['width']}x{video['height']}")
    for field in ("r_frame_rate", "avg_frame_rate"):
        if Fraction(video[field]) != FPS:
            raise ValueError(f"{path.name}: {field}={video[field]}; refusing speed/frame conversion")
    length = float(video.get("duration", info["format"]["duration"]))
    if length + 0.001 < edit["outFrame"] / FPS:
        raise ValueError(f"{path.name}: source video is too short ({length}s)")
    declared_frames = video.get("nb_frames")
    if declared_frames is None or declared_frames == "N/A":
        declared_frames = stream(probe(path, count_frames=True), "video").get("nb_read_frames")
    actual_frames = integer(declared_frames, f"{path.name} real frame count")
    if actual_frames < edit["outFrame"]:
        raise ValueError(f"{path.name}: not enough real source frames")
    if int(audio["sample_rate"]) != SAMPLE_RATE:
        raise ValueError(f"{path.name}: expected 48 kHz source audio")
    if float(audio.get("duration", length)) + 0.025 < edit["outFrame"] / FPS:
        raise ValueError(f"{path.name}: audio is too short; no silent padding will be inserted")
    return {"file": path.name, "sha256": file_hash(path), "bytes": path.stat().st_size,
            "realSourceFrames": actual_frames,
            "video": {k: video.get(k) for k in ("codec_name", "width", "height", "pix_fmt",
                       "r_frame_rate", "avg_frame_rate", "duration", "nb_frames", "color_space",
                       "color_transfer", "color_primaries")},
            "audio": {k: audio.get(k) for k in ("codec_name", "sample_rate", "channels", "duration")},
            "containerDuration": float(info["format"]["duration"])}


def loudnorm_stats(text: str) -> dict:
    objects = re.findall(r"\{\s*\"input_i\".*?\}", text, re.S)
    if not objects:
        raise ValueError("ffmpeg did not return loudnorm measurements")
    return json.loads(objects[-1])


def normalize_audio(run: Runner, edit: dict, source: dict, source_dir: Path) -> Path:
    key = digest([VERSION, "audio", source["sha256"], edit["inFrame"], edit["outFrame"], -18, -4, 11])
    output = run.work / "cache" / f"audio-{edit['id']:02d}-{key}.wav"
    report = output.with_suffix(".json")
    if output.exists() and report.exists():
        return output
    output.parent.mkdir(parents=True, exist_ok=True)
    source_path = source_dir / edit["file"]
    cut = f"atrim=start={seconds(edit['inFrame'])}:end={seconds(edit['outFrame'])},asetpts=PTS-STARTPTS"
    target = "loudnorm=I=-18:TP=-4:LRA=11"
    analysis = run.run(run.ffmpeg() + ["-loglevel", "info"] + run.input(source_path) +
                       ["-vn", "-af", f"{cut},{target}:print_format=json", "-f", "null", "-"],
                       f"audio-measure-{edit['id']:02d}", capture=True)
    measured = loudnorm_stats(analysis)
    finite = all(math.isfinite(float(measured[k])) for k in
                 ("input_i", "input_tp", "input_lra", "input_thresh", "target_offset"))
    if finite:
        normalize = target + ":linear=true:" + ":".join([
            f"measured_I={measured['input_i']}", f"measured_TP={measured['input_tp']}",
            f"measured_LRA={measured['input_lra']}", f"measured_thresh={measured['input_thresh']}",
            f"offset={measured['target_offset']}", "print_format=json"])
    else:
        normalize = "anull"  # Keep genuinely silent input silent; record it explicitly.
    sample_count = edit["frames"] * SAMPLE_RATE // FPS
    filt = f"{cut},{normalize},aresample={SAMPLE_RATE},atrim=end_sample={sample_count},asetpts=PTS-STARTPTS"
    temp = output.with_name(output.stem + ".partial.wav")
    result = run.run(run.ffmpeg() + ["-loglevel", "info"] + run.input(source_path) +
                    ["-vn", "-af", filt, "-ar", str(SAMPLE_RATE), "-ac", "2",
                     "-c:a", "pcm_s16le", str(temp)], f"audio-normalize-{edit['id']:02d}", capture=True)
    actual = stream(probe(temp), "audio")
    if abs(float(actual["duration"]) - edit["frames"] / FPS) > 1 / SAMPLE_RATE:
        raise ValueError(f"Unexpected normalized audio duration for shot {edit['id']}")
    temp.replace(output)
    write_json(report, {"source": source["file"], "key": key, "silent": not finite,
                        "targetLUFS": -18, "targetTruePeak": -4, "measurement": measured,
                        "result": loudnorm_stats(result) if finite else None})
    return output


def video_range(input_id: int, start: int, end: int, label: str) -> str:
    # Strict source validation proves this N/24 time base preserves original speed.
    # ffmpeg 7.1's trim/setpts clears CFR metadata; fps restores it for xfade.
    # With already exact N/24 timestamps this does not add, interpolate, or drop frames.
    return (f"[{input_id}:v]trim=start_frame={start}:end_frame={end},"
            f"settb=1/{FPS},setpts=N,fps={FPS}:start_time=0:eof_action=pass,"
            f"setsar=1,format=yuv420p[{label}]")


def audio_range(input_id: int, start: int, end: int, label: str) -> str:
    return (f"[{input_id}:a]atrim=start_sample={start*SAMPLE_RATE//FPS}:"
            f"end_sample={end*SAMPLE_RATE//FPS},asetpts=N/SR/TB[{label}]")


def make_chunk(run: Runner, name: str, inputs: list[Path], graph: str,
               length: int, key_data: object) -> Path:
    key = digest([VERSION, name, key_data, graph])
    output = run.work / "cache" / f"{name}-{key}.nut"
    checked = output.with_suffix(".json")
    if output.exists() and checked.exists():
        return output
    command = run.ffmpeg()
    for source in inputs:
        command += run.input(source)
    temp = output.with_name(output.stem + ".partial.nut")
    command += ["-filter_complex", graph, "-map", "[v]", "-map", "[a]",
                "-c:v", "ffv1", "-level", "3", "-coder", "1", "-context", "1",
                "-pix_fmt", "yuv420p", "-threads", str(run.threads),
                "-r", str(FPS), "-fps_mode", "cfr", "-enc_time_base:v", f"1:{FPS}",
                "-c:a", "pcm_s16le", "-ar", str(SAMPLE_RATE), "-ac", "2", str(temp)]
    run.run(command, name)
    video = stream(probe(temp, count_frames=True), "video")
    if int(video["nb_read_frames"]) != length:
        raise ValueError(f"{name}: expected {length} frames, got {video['nb_read_frames']}")
    sample_count = pcm_samples(temp)
    if sample_count != length * SAMPLE_RATE // FPS:
        raise ValueError(f"{name}: expected {length*SAMPLE_RATE//FPS} PCM samples, got {sample_count}")
    temp.replace(output)
    write_json(checked, {"frames": length, "duration": length / FPS, "key": key})
    return output


def chunks_for(run: Runner, edits: list[dict], sources: dict, audio: dict,
               source_dir: Path, partial: bool) -> list[tuple[Path, int]]:
    chunks = []
    for index, edit in enumerate(edits):
        shot_id = edit["id"]
        if shot_id not in sources:
            continue
        head = overlap_after(edits, index - 1)
        tail = overlap_after(edits, index)
        length = edit["frames"] - head - tail
        graph = ";".join([
            video_range(0, edit["inFrame"] + head, edit["outFrame"] - tail, "v"),
            audio_range(1, head, edit["frames"] - tail, "a")])
        body = make_chunk(run, f"body-{shot_id:02d}",
                          [source_dir / edit["file"], audio[shot_id]], graph, length,
                          [sources[shot_id]["sha256"], audio[shot_id].name])
        chunks.append((body, length))
        if index == len(edits) - 1 or tail == 0:
            continue
        nxt = edits[index + 1]
        if nxt["id"] not in sources:
            if not partial:
                raise ValueError("Missing transition source")
            continue
        graph = ";".join([
            video_range(0, edit["outFrame"] - tail, edit["outFrame"], "v0"),
            video_range(1, nxt["inFrame"], nxt["inFrame"] + tail, "v1"),
            f"[v0][v1]xfade=transition=fade:duration={seconds(tail)}:offset=0,"
            f"trim=end_frame={tail},settb=1/{FPS},setpts=N,format=yuv420p[v]",
            # Fade the two complete, already normalized selected audio ranges;
            # retain just their overlap. This avoids premature EOF from upstream
            # short atrim streams in the installed FFmpeg scheduler.
            f"[2:a][3:a]acrossfade=d={seconds(tail)}:c1=qsin:c2=qsin,"
            f"atrim=start_sample={(edit['frames']-tail)*SAMPLE_RATE//FPS}:"
            f"end_sample={edit['frames']*SAMPLE_RATE//FPS},asetpts=N/SR/TB[a]"])
        transition = make_chunk(run, f"dissolve-{shot_id:02d}-{nxt['id']:02d}",
                                [source_dir / edit["file"], source_dir / nxt["file"],
                                 audio[shot_id], audio[nxt["id"]]], graph, tail,
                                [sources[shot_id]["sha256"], sources[nxt["id"]]["sha256"],
                                 audio[shot_id].name, audio[nxt["id"]].name])
        chunks.append((transition, tail))
    return chunks


def ffconcat_path(path: Path) -> str:
    return "'" + str(path).replace("'", "'\\''") + "'"


def build_master(run: Runner, chunks: list, timeline: dict, signature: str,
                 preset: str) -> Path:
    output = run.work / "master-1080p.mkv"
    stamp = output.with_suffix(".json")
    if output.exists() and stamp.exists() and json.loads(stamp.read_text())["signature"] == signature:
        return output
    listing = run.work / "assembly.ffconcat"
    listing.write_text("ffconcat version 1.0\n" + "".join(
        f"file {ffconcat_path(path)}\nduration {seconds(n)}\n" for path, n in chunks))
    duration = timeline["duration"]
    # Per-shot -4 dBTP leaves >=~1 dB of headroom for the worst-case +3.01 dB
    # equal-power overlap. No delay-inducing limiter is needed at this stage.
    audio_filter = (f"afade=t=in:st=0:d=1.2:curve=qsin,"
                    f"afade=t=out:st={duration-2:.9f}:d=2:curve=qsin")
    temp = output.with_name("master-1080p.partial.mkv")
    run.run(run.ffmpeg() + ["-threads", str(run.threads), "-f", "concat", "-safe", "0",
                "-i", str(listing), "-map", "0:v:0", "-map", "0:a:0",
                "-vf", f"settb=1/{FPS},setpts=N", "-af", audio_filter,
                "-c:v", "libx264", "-preset", preset, "-crf", "16",
                "-profile:v", "high", "-level:v", "4.1", "-pix_fmt", "yuv420p",
                "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
                "-threads", str(run.threads), "-r", str(FPS), "-fps_mode", "cfr", "-enc_time_base:v", f"1:{FPS}",
                "-c:a", "pcm_s16le", "-ar", str(SAMPLE_RATE), "-ac", "2", str(temp)], "master-1080p")
    info = probe(temp, count_frames=True)
    video = stream(info, "video")
    if int(video["nb_read_frames"]) != timeline["durationFrames"]:
        raise ValueError("Master has an incorrect frame count")
    if Fraction(video["avg_frame_rate"]) != FPS:
        raise ValueError("Master is not 24 fps")
    if pcm_samples(temp) != timeline["durationFrames"] * SAMPLE_RATE // FPS:
        raise ValueError("Master audio does not have the exact required number of PCM samples")
    if abs(float(info["format"]["duration"]) - duration) > 1 / FPS + 0.002:
        raise ValueError("Master duration does not match the edit decision list")
    temp.replace(output)
    write_json(stamp, {"signature": signature, "frames": int(video["nb_read_frames"]),
                       "duration": float(info["format"]["duration"]), "bytes": output.stat().st_size,
                       "videoCRF": 16, "preset": preset, "audio": "48 kHz stereo PCM s16le"})
    return output


def check_variant(directory: Path, expected: float) -> dict:
    playlist = directory / "index.m3u8"
    text = playlist.read_text()
    if "#EXT-X-ENDLIST" not in text or "#EXT-X-INDEPENDENT-SEGMENTS" not in text:
        raise ValueError(f"Incomplete VOD playlist: {playlist}")
    durations = [float(x) for x in re.findall(r"#EXTINF:([0-9.]+)", text)]
    names = [line.strip() for line in text.splitlines() if line and not line.startswith("#")]
    if len(names) != len(durations) or not names:
        raise ValueError(f"Invalid playlist: {playlist}")
    if abs(sum(durations) - expected) > 1 / FPS + 0.002:
        raise ValueError(f"HLS duration {sum(durations)} does not match {expected}")
    sizes = []
    for name, duration in zip(names, durations):
        if Path(name).name != name:
            raise ValueError(f"Segment URI must be relative: {name}")
        size = (directory / name).stat().st_size
        if not 0 < size < MAX_SEGMENT_BYTES:
            raise ValueError(f"Segment exceeds 25 MiB limit or is empty: {name} ({size} bytes)")
        if duration > 6 + 1 / FPS:
            raise ValueError(f"Segment is longer than 6 seconds: {name}")
        sizes.append(size)
    media = probe(playlist, count_frames=True)
    video, audio = stream(media, "video"), stream(media, "audio")
    expected_frames = round(expected * FPS)
    if int(video["nb_read_frames"]) != expected_frames or Fraction(video["avg_frame_rate"]) != FPS:
        raise ValueError(f"HLS decoded frame count or rate does not match the edit: {playlist}")
    variant = next(v for v in VARIANTS if v["name"] == directory.name)
    if (video["width"], video["height"]) != (variant["width"], variant["height"]):
        raise ValueError(f"HLS resolution does not match its master playlist declaration: {playlist}")
    if video["profile"] != "High" or video["level"] != round(float(variant["level"]) * 10):
        raise ValueError(f"HLS H.264 profile/level does not match its CODECS declaration: {playlist}")
    if audio["codec_name"] != "aac" or audio.get("profile") != "LC":
        raise ValueError(f"Expected AAC-LC in {playlist}")
    return {"segments": len(names), "duration": sum(durations), "bytes": sum(sizes),
            "decodedFrames": expected_frames, "fps": FPS,
            "width": video["width"], "height": video["height"],
            "maxSegmentBytes": max(sizes),
            "averageBandwidth": math.ceil(sum(sizes) * 8 / sum(durations)),
            "bandwidth": math.ceil(max(s * 8 / d for s, d in zip(sizes, durations)) * 1.05)}


def encode_hls(run: Runner, master: Path, timeline: dict, signature: str, preset: str) -> tuple[Path, dict]:
    staging = run.work / f"hls-{signature}"
    reports = {}
    for variant in VARIANTS:  # Deliberately sequential: no simultaneous 1080p and 720p encoder buffers.
        directory = staging / variant["name"]
        playlist = directory / "index.m3u8"
        if playlist.exists():
            try:
                reports[variant["name"]] = check_variant(directory, timeline["duration"])
                continue
            except (OSError, ValueError):
                shutil.rmtree(directory)
        directory.mkdir(parents=True, exist_ok=True)
        filt = f"scale={variant['width']}:{variant['height']}:flags=lanczos,setsar=1"
        run.run(run.ffmpeg() + run.input(master) + [
            "-map", "0:v:0", "-map", "0:a:0", "-vf", filt,
            "-c:v", "libx264", "-preset", preset, "-profile:v", "high", "-level:v", variant["level"],
            "-pix_fmt", "yuv420p", "-b:v", variant["rate"], "-maxrate", variant["maxrate"],
            "-bufsize", variant["bufsize"], "-threads", str(run.threads),
            "-g", "144", "-keyint_min", "144", "-sc_threshold", "0", "-flags", "+cgop",
            "-force_key_frames", "expr:gte(t,n_forced*6)", "-r", str(FPS), "-fps_mode", "cfr",
            "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
            "-c:a", "aac", "-b:a", "128k", "-ar", str(SAMPLE_RATE), "-ac", "2",
            "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod", "-hls_list_size", "0",
            "-hls_flags", "independent_segments", "-hls_segment_filename", str(directory / "segment-%03d.ts"),
            str(playlist)], f"HLS-{variant['name']}")
        reports[variant["name"]] = check_variant(directory, timeline["duration"])
    lines = ["#EXTM3U", "#EXT-X-VERSION:6", "#EXT-X-INDEPENDENT-SEGMENTS"]
    for variant in VARIANTS:
        result = reports[variant["name"]]
        lines += [f"#EXT-X-STREAM-INF:BANDWIDTH={result['bandwidth']},AVERAGE-BANDWIDTH={result['averageBandwidth']},"
                  f"RESOLUTION={variant['width']}x{variant['height']},FRAME-RATE=24.000,"
                  f"CODECS=\"{variant['codec']},mp4a.40.2\"", f"{variant['name']}/index.m3u8"]
    (staging / "index.m3u8").write_text("\n".join(lines) + "\n")
    write_json(staging / "timeline.json", timeline)
    return staging, reports


def extract_still(run: Runner, source: Path, frame: int, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = output.with_name(output.stem + ".partial.webp")
    run.run(run.ffmpeg() + run.input(source) + ["-vf", f"select=eq(n\\,{frame})", "-frames:v", "1",
            "-c:v", "libwebp", "-quality", "88", "-compression_level", "6", str(temp)], output.stem)
    if not temp.exists() or temp.stat().st_size == 0:
        raise ValueError(f"Failed to extract real video frame {frame}")
    temp.replace(output)


def publish_local(staging: Path, output: Path, work: Path) -> None:
    # Only the local build artifact is replaced; this script never uploads or deploys.
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = output.with_name(output.name + ".building")
    if temp.exists():
        shutil.rmtree(temp)
    shutil.copytree(staging, temp)
    if output.exists():
        backup = work / ("previous-film-" + dt.datetime.now().strftime("%Y%m%d-%H%M%S"))
        shutil.move(str(output), str(backup))
    temp.replace(output)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("plan", "inspect", "prepare", "build"))
    parser.add_argument("--input-dir", type=Path, default=Path("/workspace/shared/long-castle-ride"))
    parser.add_argument("--work-dir", type=Path, default=Path("/workspace/shared/long-castle-ride/build"))
    parser.add_argument("--output-dir", type=Path, default=REPO / "public/journey/film")
    parser.add_argument("--timeline-source", type=Path, default=REPO / "src/journey/rideTimeline.json")
    parser.add_argument("--write-planned-timeline", action="store_true",
                        help="Explicitly copy a plan to --timeline-source; normally plans remain in --work-dir")
    parser.add_argument("--edit-list", type=Path)
    parser.add_argument("--count", type=int, default=18)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--min-duration", type=float, default=300,
                        help="300 for release; lower only for an isolated, nonpublic pipeline test")
    parser.add_argument("--allow-short", action="store_true",
                        help="Allow a shorter generated film only when the separately implemented finale reaches the total minimum")
    parser.add_argument("--finale-duration", type=float, default=0,
                        help="Actual separate interactive 3D finale duration; never counted as generated video")
    parser.add_argument("--master-preset", default="fast")
    parser.add_argument("--hls-preset", default="medium")
    args = parser.parse_args()
    args.work_dir.mkdir(parents=True, exist_ok=True)
    if args.threads < 1:
        raise ValueError("--threads must be positive")
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise ValueError("ffmpeg and ffprobe are required")
    edits = read_edits(args)
    timeline = timeline_for(edits)
    if not math.isfinite(args.finale_duration) or args.finale_duration < 0:
        raise ValueError("--finale-duration must be finite and nonnegative")
    if not math.isfinite(args.min_duration) or args.min_duration < 0:
        raise ValueError("--min-duration must be finite and nonnegative")
    timeline["finaleDuration"] = args.finale_duration
    timeline["totalExperienceDuration"] = timeline["duration"] + args.finale_duration
    missing = [e["file"] for e in edits if not (args.input_dir / e["file"]).is_file()]
    write_json(args.work_dir / "planned-timeline.json", timeline)
    if args.action == "plan" and args.write_planned_timeline:
        write_json(args.timeline_source, timeline)
    print(json.dumps({"shots": len(edits), "seconds": timeline["duration"],
                      "frames": timeline["durationFrames"], "missing": missing}, ensure_ascii=False), flush=True)
    if args.action == "plan":
        return 0
    if args.action == "build":
        if missing:
            raise ValueError("Missing input clips: " + ", ".join(missing))
        if timeline["duration"] < args.min_duration and not args.allow_short:
            raise ValueError(f"{timeline['duration']}s film is below {args.min_duration}s; a separately implemented finale requires --allow-short --finale-duration")
        if timeline["totalExperienceDuration"] < args.min_duration:
            raise ValueError(f"Total experience is only {timeline['totalExperienceDuration']}s, below {args.min_duration}s")
    ffmpeg_version = subprocess.check_output(["ffmpeg", "-version"], text=True).splitlines()[0]
    sources, hashes = {}, {}
    for edit in edits:
        path = args.input_dir / edit["file"]
        if not path.exists():
            continue
        result = inspect_source(path, edit)
        if result["sha256"] in hashes:
            raise ValueError(f"Identical media in shots {hashes[result['sha256']]} and {edit['id']}")
        hashes[result["sha256"]] = edit["id"]
        sources[edit["id"]] = result
        print(f"checked {path.name}: 1080x1920 / 24 fps / {result['realSourceFrames']} real frames", flush=True)
    write_json(args.work_dir / "source-report.json", {"ffmpeg": ffmpeg_version, "sources": list(sources.values())})
    if args.action == "inspect":
        return 0
    free = shutil.disk_usage(args.work_dir).free
    if free < 12 * 1024 ** 3:
        raise ValueError("Keep at least 12 GiB free for the lossless intermediate cache")
    run = Runner(args.work_dir, args.threads)
    audio = {e["id"]: normalize_audio(run, e, sources[e["id"]], args.input_dir)
             for e in edits if e["id"] in sources}
    chunks = chunks_for(run, edits, sources, audio, args.input_dir, partial=args.action == "prepare")
    if args.action == "prepare":
        print(f"Prepared {len(sources)} source clips / {len(chunks)} lossless chunks; no release output changed.")
        return 0
    if sum(n for _, n in chunks) != timeline["durationFrames"]:
        raise ValueError("Chunk timeline does not match the edit decision list")
    signature = digest([VERSION, ffmpeg_version, edits, [s["sha256"] for s in sources.values()],
                        args.master_preset, args.hls_preset, VARIANTS])
    master = build_master(run, chunks, timeline, signature, args.master_preset)
    staging, hls_report = encode_hls(run, master, timeline, signature, args.hls_preset)
    publish_local(staging, args.output_dir, args.work_dir)
    extract_still(run, master, 0, args.output_dir.parent / "cover.webp")
    extract_still(run, master, timeline["durationFrames"] - 1, args.output_dir.parent / "ending.webp")
    # A missing/rejected source must never replace the currently running timeline.
    write_json(args.timeline_source, timeline)
    report = {"signature": signature, "ffmpeg": ffmpeg_version, "duration": timeline["duration"],
              "finaleDuration": args.finale_duration,
              "totalExperienceDuration": timeline["totalExperienceDuration"],
              "frames": timeline["durationFrames"], "fps": FPS, "master": str(master),
              "output": str(args.output_dir), "variants": hls_report,
              "settings": {"defaultCrossfadeFrames": OVERLAP_FRAMES,
                           "outgoingOverlapFrames": [overlap_after(edits, index) for index in range(len(edits))],
                           "audioLUFS": -18,
                           "audioTruePeakDBTP": -4, "audioBitrate": 128000, "segmentSeconds": 6,
                           "masterCRF": 16, "masterPreset": args.master_preset,
                           "hlsPreset": args.hls_preset, "encoderThreads": args.threads}}
    write_json(args.work_dir / "build-report.json", report)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)

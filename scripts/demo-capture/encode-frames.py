"""Encode a native CDP screencast using its recorded frame timestamps."""
import argparse
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("root", type=Path)
parser.add_argument("ids", nargs="*")
parser.add_argument("--ffmpeg", default="E:/_ARCHIVE/zoom-recorder/binaries/ffmpeg.exe")
parser.add_argument("--frames-dir", type=Path, help="folder holding one <id>/ per capture; default <root>/production/frames")
parser.add_argument("--out-dir", type=Path, help="folder for <id>.mp4; default <root>/raw-desktop")
parser.add_argument("--output", type=Path, help="exact output file; needs exactly one capture id")
parser.add_argument("--size", default="1920x1080", help="WIDTHxHEIGHT of the video")
args = parser.parse_args()
if args.output and len(args.ids) != 1:
    parser.error("--output needs exactly one capture id")
width, height = (int(part) for part in args.size.lower().split("x"))
frames_root = args.frames_dir or args.root / "production" / "frames"
out_dir = args.out_dir or args.root / "raw-desktop"
if args.ids:
    folders = [frames_root / name for name in args.ids]
    for folder in folders:
        if not (folder / "capture.json").exists():
            raise RuntimeError(f"No capture.json for {folder.name} in {frames_root}")
else:
    folders = sorted(frames_root.iterdir())
for folder in folders:
    proof = json.loads((folder / "capture.json").read_text(encoding="utf-8"))
    if proof.get("failure"):
        raise RuntimeError(f"Rejected capture {folder.name}: {proof['failure']}")
    # Chrome now and then delivers a screencast frame after a later one (seen
    # 2026-10-07, 11 ms apart). CDP stamps each frame with its swap time, so
    # play them in timestamp order and drop a frame that repeats a timestamp.
    frames = sorted(proof["frames"], key=lambda frame: frame["timestamp"])
    frames = [frame for index, frame in enumerate(frames)
              if index == 0 or frame["timestamp"] > frames[index - 1]["timestamp"]]
    if len(frames) < 2:
        raise RuntimeError(f"Insufficient frames for {folder.name}")
    lines = ["ffconcat version 1.0"]
    gaps = []
    for index, frame in enumerate(frames):
        gap = (frames[index + 1]["timestamp"] - frame["timestamp"]) if index + 1 < len(frames) else 1 / 30
        gaps.append(gap)
        lines.extend([f"file '{frame['file']}'", "option framerate 1000", f"duration {gap:.9f}"])
    lines.append(f"file '{frames[-1]['file']}'")
    lines.append("option framerate 1000")
    timeline = folder / "timeline.ffconcat"
    timeline.write_text("\n".join(lines) + "\n", encoding="utf-8")
    output = args.output or out_dir / f"{folder.name}.mp4"
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run([args.ffmpeg, "-y", "-v", "error", "-safe", "0", "-f", "concat", "-i", str(timeline),
                        "-vf", f"fps=30,scale={width}:{height}", "-c:v", "libx264", "-preset", "fast", "-crf", "16",
                        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output)], check=True)
    except BaseException:
        output.unlink(missing_ok=True)
        raise
    print(json.dumps({"id": folder.name, "output": str(output), "frames": len(frames), "seconds": sum(gaps),
                      "sourceAverageFps": (len(frames)-1)/(frames[-1]["timestamp"]-frames[0]["timestamp"]),
                      "maxFrameGapSeconds": max(gaps), "outputFps": 30}), flush=True)

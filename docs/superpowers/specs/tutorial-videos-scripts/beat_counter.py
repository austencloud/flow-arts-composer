"""Find when the beat counter (top-left digit) changes in a TKA animation export.

Usage: python beat_counter.py <video> [x y w h]
Prints one line per detected change: the midpoint time of the digit crossfade.
"""
import subprocess, sys
import numpy as np

video = sys.argv[1]
x, y, w, h = (int(v) for v in sys.argv[2:6]) if len(sys.argv) >= 6 else (0, 70, 100, 80)

probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                        'stream=width,height,r_frame_rate', '-of', 'csv=p=0', video],
                       capture_output=True, text=True).stdout.strip().split(',')
W, H = int(probe[0]), int(probe[1])
num, den = (int(v) for v in probe[2].split('/'))
fps = num / den
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', video, '-vf', f'crop={w}:{h}:{x}:{y},format=gray',
                      '-f', 'rawvideo', '-'], capture_output=True).stdout
frames = np.frombuffer(raw, dtype=np.uint8).reshape(-1, h, w).astype(np.float32)
n = len(frames)
diff = np.abs(frames[1:] - frames[:-1]).mean(axis=(1, 2))
# A change event is a run of frames whose difference stands above the noise.
thresh = max(1.0, np.median(diff) * 4)
events = []
i = 0
while i < len(diff):
    if diff[i] > thresh:
        j = i
        while j + 1 < len(diff) and diff[j + 1] > thresh:
            j += 1
        # diff[k] is between frame k and k+1; the weighted centre of the run.
        ks = np.arange(i, j + 1)
        centre = (ks * diff[i:j + 1]).sum() / diff[i:j + 1].sum() + 0.5
        events.append((centre / fps, float(diff[i:j + 1].max())))
        i = j + 1
    else:
        i += 1
print(f'# {video} {W}x{H} {fps:.3f}fps frames {n} thresh {thresh:.2f}')
for t, peak in events:
    print(f'{t:.3f} {peak:.1f}')

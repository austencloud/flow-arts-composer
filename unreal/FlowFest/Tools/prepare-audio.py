"""Render original, deterministic ambient loops. No downloaded audio or licenses."""
from pathlib import Path
import math
import random
import struct
import wave
import hashlib
import json

OUT = Path(__file__).resolve().parent / 'staged' / 'audio'
OUT.mkdir(parents=True, exist_ok=True)
RATE = 22050
DURATION = 12
COUNT = RATE * DURATION
TAU = math.tau


def smooth_noise(seed, seconds):
    rng = random.Random(seed)
    knots = max(4, round(DURATION / seconds))
    # Shared first knot closes the waveform without a seam.
    values = [rng.uniform(-1, 1) for _ in range(knots)]
    result = []
    for i in range(COUNT):
        p = i / COUNT * knots
        left = int(p)
        f = p - left
        f = f * f * (3 - 2 * f)
        result.append(values[left] * (1 - f) + values[(left + 1) % knots] * f)
    return result


def chirp(t, center, length, base, sweep):
    d = (t - center + DURATION / 2) % DURATION - DURATION / 2
    if abs(d) > length / 2:
        return 0
    u = (d + length / 2) / length
    envelope = math.sin(math.pi * u) ** 2
    return envelope * math.sin(TAU * (base * d + sweep * d * d / (2 * length)))


def lowpass(values, cutoff):
    # Settle the filter over one full periodic buffer before recording it.
    a = math.exp(-TAU * cutoff / RATE)
    state = 0.0
    for value in values:
        state = a * state + (1 - a) * value
    result = []
    for value in values:
        state = a * state + (1 - a) * value
        result.append(state)
    return result


def noise_bands(seed):
    rng = random.Random(seed)
    white = [rng.uniform(-1, 1) for _ in range(COUNT)]
    bass, body, air = (lowpass(white, hz) for hz in (100, 650, 4500))
    return bass, [b - a for a, b in zip(bass, body)], [b - a for a, b in zip(body, air)]


def crackles(seed):
    rng = random.Random(seed)
    result = [0.0] * COUNT
    for _ in range(112):
        start = rng.randrange(COUNT)
        duration = rng.uniform(.006, .055)
        gain = rng.uniform(.10, .68)
        for j in range(round(duration * RATE)):
            t = j / RATE
            envelope = min(1, t * 2200) * math.exp(-t * 5 / duration)
            result[(start + j) % COUNT] += gain * envelope * rng.uniform(-1, 1)
    return result


def render(name, seed):
    slow = smooth_noise(seed, .9)
    syllables = smooth_noise(seed + 17, .19)
    bass, body, air = noise_bands(seed + 31)
    sparks = crackles(seed + 97) if name == 'Fire' else None
    values = []
    for i in range(COUNT):
        t = i / RATE
        gust = .65 + .28 * slow[i]
        if name == 'WoodlandWind':
            v = gust * (.55 * bass[i] + .55 * body[i] + .22 * air[i])
        elif name == 'Birds':
            v = .025 * body[i]
            for c, pitch in ((1.2, 2100), (2.15, 1700), (4.7, 2400), (7.1, 1850), (8.05, 2150), (10.4, 1950)):
                v += .29 * chirp(t, c, .18, pitch, 900)
        elif name == 'Insects':
            # Several quiet, intermittent calls instead of a continuous pure tone.
            v = .025 * air[i]
            for frequency, rate, phase in ((3900, 11, .2), (4400, 7, 1.3), (4700, 13, 3.0)):
                pulse = max(0, math.sin(TAU * rate * t + phase)) ** 8
                phrase = max(0, math.sin(TAU * t / 4 + phase)) ** 2
                v += .10 * pulse * phrase * math.sin(TAU * frequency * t)
        elif name == 'Fire':
            v = gust * (.40 * bass[i] + .30 * body[i] + .08 * air[i]) + sparks[i]
        else:
            # Abstract gathering texture, without words or recorded speech.
            voices = sum(math.sin(TAU * hz * t) * (.4 + .6 * max(0,
                math.sin(TAU * rate * t + phase))) for hz, rate, phase in
                ((113, 1.5, .3), (147, 2.25, 1.7), (191, 1.75, 4.1)))
            v = (.13 * body[i] + .025 * air[i] + .018 * voices) * (.6 + .3 * syllables[i])
            if name == 'Crowd':
                v += .06 * body[i] * (.7 + .3 * slow[i])
        values.append(v)
    mean = sum(values) / COUNT
    values = [v - mean for v in values]
    rms = math.sqrt(sum(v * v for v in values) / COUNT)
    target = {'WoodlandWind': .075, 'Birds': .040, 'Insects': .022,
              'Camp': .030, 'Fire': .070, 'Crowd': .045}[name]
    gain = min(target / max(rms, 1e-9), .82 / max(abs(v) for v in values))
    pcm = [round(v * gain * 32767) for v in values]
    samples = struct.pack('<' + 'h' * COUNT, *pcm)
    path = OUT / (name + '.wav')
    with wave.open(str(path), 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(samples)
    jumps = sorted(abs(pcm[i] - pcm[i - 1]) / 32767 for i in range(1, COUNT))
    seam = abs(pcm[0] - pcm[-1]) / 32767
    if seam > max(.035, jumps[int(len(jumps) * .999)] * 1.5):
        raise RuntimeError(f'{name}: discontinuous loop boundary {seam}')
    report = {'name': name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
              'seconds': DURATION, 'sampleRate': RATE, 'channels': 1,
              'rms': rms * gain, 'peak': max(abs(v) for v in pcm) / 32767,
              'boundaryStep': seam, 'interiorStepP999': jumps[int(len(jumps) * .999)]}
    print(f'{name}: {DURATION}s mono, rms={report["rms"]:.4f}, peak={report["peak"]:.4f}, seam={seam:.5f}')
    return report


if __name__ == '__main__':
    reports = [render(name, 7850 + index * 97) for index, name in enumerate(
        ('WoodlandWind', 'Birds', 'Insects', 'Camp', 'Fire', 'Crowd'))]
    (OUT / 'audio-report.json').write_text(json.dumps(reports, indent=2))

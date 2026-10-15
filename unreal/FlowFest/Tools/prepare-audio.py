"""Render original, deterministic ambient loops. No downloaded audio or licenses."""
from pathlib import Path
import math
import random
import struct
import wave

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


def render(name, seed):
    slow = smooth_noise(seed, .28)
    fine = smooth_noise(seed + 31, .025)
    pulse = smooth_noise(seed + 79, .07)
    samples = bytearray()
    for i in range(COUNT):
        t = i / RATE
        if name == 'WoodlandWind':
            v = .54 * slow[i] + .13 * fine[i] + .10 * math.sin(TAU * t / DURATION)
        elif name == 'Birds':
            v = .06 * slow[i]
            for c, pitch in ((1.2, 2100), (2.15, 1700), (4.7, 2400), (7.1, 1850), (8.05, 2150), (10.4, 1950)):
                v += .29 * chirp(t, c, .18, pitch, 900)
        elif name == 'Insects':
            v = .13 * slow[i] + .31 * math.sin(TAU * 4200 * t) * (.5 + .5 * math.sin(TAU * 8 * t))
        elif name == 'Camp':
            # Low, unresolved human murmur with no synthetic words or speech.
            v = .32 * slow[i] + .12 * math.sin(TAU * 113 * t) * pulse[i] + .09 * fine[i]
        elif name == 'Fire':
            crackle = max(0, pulse[i] - .53) ** 3 * 3
            v = .23 * slow[i] + .19 * fine[i] + crackle
        else:  # Crowd: gathering rhythm and indistinct distant murmur.
            beat = max(0, math.sin(TAU * 2 * t)) ** 12
            v = .28 * slow[i] + .18 * fine[i] + .12 * beat + .1 * math.sin(TAU * 95 * t) * pulse[i]
        samples += struct.pack('<h', int(max(-.95, min(.95, v)) * 24000))
    path = OUT / (name + '.wav')
    with wave.open(str(path), 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(samples)
    print(f'{name}: {path.name}, {DURATION}s mono')


for index, name in enumerate(('WoodlandWind', 'Birds', 'Insects', 'Camp', 'Fire', 'Crowd')):
    render(name, 7850 + index * 97)

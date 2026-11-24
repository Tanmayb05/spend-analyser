# Soundtrack for the brag video: 120 BPM, D minor -> F major, 21.0 s. Every event on the beat grid from t=0.
import numpy as np, wave

SR = 48000
DUR = 21.0
N = int(SR * DUR)
BEAT = 0.5
t_all = np.arange(N) / SR
mixL = np.zeros(N); mixR = np.zeros(N)

def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
def add(sig, start, gain=1.0, pan=0.0):
    i = int(round(start * SR)); j = min(N, i + len(sig))
    if j <= i: return
    l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
    mixL[i:j] += sig[: j - i] * gain * l * 1.414
    mixR[i:j] += sig[: j - i] * gain * r * 1.414

def onepole(x, fc):
    a = np.exp(-2 * np.pi * fc / SR); y = np.zeros_like(x); s = 0.0
    for k in range(len(x)):
        s = (1 - a) * x[k] + a * s; y[k] = s
    return y

# chords (midi), one per 2 s bar
D, F, A, C, Bb, E, G = 62, 65, 69, 72, 70, 64, 67
CH = {"Dm": [50, 57, 62, 65, 69], "Bb": [46, 58, 62, 65, 70], "F": [41, 57, 60, 65, 69], "C": [48, 55, 60, 64, 67]}
bars = ["Dm", "Bb", "F", "C", "Dm", "Bb", "F", "C"]
plan = [(i * 2.0, 2.0, c) for i, c in enumerate(bars)]          # 0-16
plan += [(16.0, 1.0, "Bb"), (17.0, 1.0, "C"), (18.0, 3.0, "F")]  # lift into outro, resolve on F

# ---- pad: detuned saws, soft attack, low-passed
for st, ln, c in plan:
    L = ln + (1.6 if st == 18.0 else 0.25)
    tt = np.arange(int(L * SR)) / SR
    sig = np.zeros_like(tt)
    for m in CH[c][1:]:
        for det in (-0.08, 0.08):
            f = hz(m + det)
            sig += 2 * ((tt * f) % 1.0) - 1
    env = np.minimum(1, tt / 0.35) * np.where(tt > ln, np.exp(-(tt - ln) / (0.7 if st == 18.0 else 0.12)), 1)
    sig = onepole(sig, 1400 if st < 18 else 1800) * env / 8
    add(sig, st, 0.16, -0.25); add(sig, st, 0.16, 0.25)

# ---- bass: root eighths from 3.0 s (the reveal), long note on the outro
def bassnote(m, L):
    tt = np.arange(int(L * SR)) / SR
    s = np.sin(2 * np.pi * hz(m) * tt) + 0.3 * np.sin(4 * np.pi * hz(m) * tt)
    env = np.minimum(1, tt / 0.005) * np.exp(-tt / (L * 0.9))
    return np.tanh(1.5 * s) * env
for st, ln, c in plan:
    root = CH[c][0] - 12 if CH[c][0] >= 46 else CH[c][0]
    root = CH[c][0] - 12
    if st == 18.0:
        add(bassnote(root, 3.0), 18.0, 0.32)
        continue
    k = 0
    while k * BEAT / 2 < ln:
        tb = st + k * BEAT / 2
        if tb >= 3.0 and not (16.75 <= tb < 18.0 and k % 2):
            add(bassnote(root, 0.24), tb, 0.21 if k % 2 == 0 else 0.14)
        k += 1

# ---- kick on beats from 3.0 to 17.5 (drops out for the last half-bar before the outro), one soft hit at 18
def kick():
    tt = np.arange(int(0.35 * SR)) / SR
    f = 45 + 70 * np.exp(-tt / 0.03)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-tt / 0.12)
K = kick()
for b in range(6, 35):
    add(K, b * BEAT, 0.3)
add(K, 18.0, 0.36)

# ---- hats: off-beats, quiet, filtered noise
rng = np.random.default_rng(7)
def hat():
    n = rng.standard_normal(int(0.06 * SR))
    hp = n - onepole(n, 6000)
    return hp * np.exp(-np.arange(len(n)) / SR / 0.018)
for b in range(6, 35):
    add(hat(), b * BEAT + BEAT / 2, 0.075, 0.3)

# ---- pluck arpeggio, eighths, chord tones up high (quiet bed), from 0 to 18
def pluck(m, L=0.45, bright=1.0):
    tt = np.arange(int(L * SR)) / SR
    f = hz(m)
    s = np.sin(2 * np.pi * f * tt) + 0.35 * bright * np.sin(4 * np.pi * f * tt) * np.exp(-tt / 0.08) + 0.12 * np.sin(6 * np.pi * f * tt) * np.exp(-tt / 0.05)
    return s * np.minimum(1, tt / 0.003) * np.exp(-tt / 0.16)
pattern = [0, 1, 2, 3, 2, 1, 2, 3]
for st, ln, c in plan:
    if st >= 18.0: break
    tones = [m + 12 for m in CH[c][1:]]
    k = 0
    while k * BEAT / 2 < ln:
        tb = st + k * BEAT / 2
        add(pluck(tones[pattern[k % 8]]), tb, 0.075 if tb < 3 else 0.045, -0.35 if k % 2 else 0.35)
        k += 1

# ---- accents: four rising plucks on the KPI landings (F chord: F A C F), a calendar run, outro bell
for i, m in enumerate([77, 81, 84, 89]):
    add(pluck(m, 0.8, 1.4), 4.5 + i * 0.5, 0.11, -0.2 + 0.13 * i)
for i, m in enumerate([74, 77, 81, 84, 81, 77, 74, 77]):  # Dm run under the calendar fill (7.5-9.25 on eighths)
    add(pluck(m, 0.35), 7.5 + i * 0.25, 0.035, 0.4 if i % 2 else -0.4)
for m in [77, 81, 84]:
    add(pluck(m, 2.6, 0.6) * 1.0, 18.0, 0.07)

# ---- swells into each cut (filtered noise, 0.5 s, ends on the cut)
for cut in [3.0, 7.0, 11.0, 15.0, 18.0]:
    L = 0.5
    n = rng.standard_normal(int(L * SR))
    sw = onepole(n, 2500) * (np.linspace(0, 1, len(n)) ** 2.5)
    add(sw, cut - L, 0.12, 0.0)

# ---- master: gentle glue, fade out over the last 0.8 s
mix = np.stack([mixL, mixR], 1)
mix = np.tanh(mix * 1.1) / 1.1
fade = np.clip((DUR - t_all) / 0.8, 0, 1)
mix *= fade[:, None]
mix /= np.max(np.abs(mix)) / 0.89
pcm = (mix * 32767).astype(np.int16)
with wave.open("music.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("ok", pcm.shape[0] / SR, "s")

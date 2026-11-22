import { describe, expect, it } from "vitest";
import { downsample, encodeWav, formatClock, parseWav, VOICE_MAX_BYTES, VOICE_MAX_SECONDS, VOICE_SAMPLE_RATE } from "@/lib/voice";

const sine = (seconds: number, rate: number, hz = 440) => Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => Math.sin((2 * Math.PI * hz * i) / rate) * 0.5);

describe("encodeWav / parseWav", () => {
  it("writes a canonical 16-bit mono header that reads back", () => {
    const wav = encodeWav(sine(1, VOICE_SAMPLE_RATE));
    expect(wav.byteLength).toBe(44 + VOICE_SAMPLE_RATE * 2);
    expect(parseWav(wav)).toEqual({ sampleRate: VOICE_SAMPLE_RATE, channels: 1, bits: 16, seconds: 1 });
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
  });
  it("clips out-of-range samples instead of wrapping", () => {
    const wav = encodeWav(Float32Array.of(2, -2, 0));
    const v = new DataView(wav.buffer);
    expect(v.getInt16(44, true)).toBe(0x7fff);
    expect(v.getInt16(46, true)).toBe(-0x8000);
    expect(v.getInt16(48, true)).toBe(0);
  });
  it("rejects things that are not a plain PCM WAV", () => {
    expect(parseWav(new Uint8Array(10))).toBeNull();
    expect(parseWav(new TextEncoder().encode("ID3".padEnd(64, "x")))).toBeNull();
    const stereo = encodeWav(sine(0.1, VOICE_SAMPLE_RATE));
    new DataView(stereo.buffer).setUint16(20, 3, true); // float format, not PCM
    expect(parseWav(stereo)).toBeNull();
  });
  it("rejects a header that claims more audio than was sent", () => {
    const wav = encodeWav(sine(1, VOICE_SAMPLE_RATE));
    expect(parseWav(wav.slice(0, 1000))).toBeNull();
  });
  it("keeps a maximum-length clip under the size cap", () => {
    expect(encodeWav(new Float32Array(VOICE_MAX_SECONDS * VOICE_SAMPLE_RATE)).byteLength).toBeLessThan(VOICE_MAX_BYTES);
    expect(VOICE_MAX_BYTES).toBeLessThan(2 * 1024 * 1024); // well inside the 4 MB action body limit
  });
});

describe("downsample", () => {
  it("brings 48 kHz down to 16 kHz with a third of the samples", () => {
    const out = downsample(sine(1, 48_000), 48_000, VOICE_SAMPLE_RATE);
    expect(out.length).toBe(VOICE_SAMPLE_RATE);
  });
  it("handles a non-integer ratio (44.1 kHz)", () => {
    const out = downsample(sine(1, 44_100), 44_100, VOICE_SAMPLE_RATE);
    expect(Math.abs(out.length - VOICE_SAMPLE_RATE)).toBeLessThanOrEqual(1);
  });
  it("averages each window so a constant signal stays constant", () => {
    const out = downsample(new Float32Array(300).fill(0.25), 48_000, 16_000);
    expect(out.every((s) => Math.abs(s - 0.25) < 1e-6)).toBe(true);
  });
  it("returns the input untouched when it is already at or below the target rate", () => {
    const input = sine(0.1, 8_000);
    expect(downsample(input, 8_000, 16_000)).toBe(input);
  });
});

describe("formatClock", () => {
  it("formats minutes and padded seconds", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(7.9)).toBe("0:07");
    expect(formatClock(60)).toBe("1:00");
    expect(formatClock(-3)).toBe("0:00");
  });
});

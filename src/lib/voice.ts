/**
 * Voice recording helpers shared by the browser recorder and the server action.
 * Audio travels as 16 kHz mono 16-bit WAV: every transcription provider reads it, and it avoids the
 * per-browser MediaRecorder formats (WebM, MP4). 60 s is about 1.9 MB, inside the 4 MB action body limit.
 */

export const VOICE_SAMPLE_RATE = 16_000;
export const VOICE_MAX_SECONDS = 60;
/** Shortest clip worth sending. Anything shorter is a mis-click. */
export const VOICE_MIN_SECONDS = 0.5;

const HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 2;
/** Largest WAV the server accepts (the cap plus a little slack for rounding). */
export const VOICE_MAX_BYTES = HEADER_BYTES + (VOICE_MAX_SECONDS + 1) * VOICE_SAMPLE_RATE * BYTES_PER_SAMPLE;

/** Lower the sample rate by averaging each output sample's source window (a cheap low-pass, enough for speech). */
export function downsample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (toRate >= fromRate) return input;
  const ratio = fromRate / toRate;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

/** Encode mono float samples (-1..1) as a 16-bit PCM WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number = VOICE_SAMPLE_RATE): Uint8Array<ArrayBuffer> {
  const dataBytes = samples.length * BYTES_PER_SAMPLE;
  const bytes = new Uint8Array(HEADER_BYTES + dataBytes);
  const v = new DataView(bytes.buffer);
  const tag = (offset: number, s: string) => [...s].forEach((c, i) => v.setUint8(offset + i, c.charCodeAt(0)));
  tag(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * BYTES_PER_SAMPLE, true); // byte rate
  v.setUint16(32, BYTES_PER_SAMPLE, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  tag(36, "data");
  v.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(HEADER_BYTES + i * BYTES_PER_SAMPLE, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

export type WavInfo = { sampleRate: number; channels: number; bits: number; seconds: number };

/** Read a canonical PCM WAV header. Returns null for anything that isn't a plain 16-bit PCM WAV with a well-formed size. */
export function parseWav(bytes: Uint8Array): WavInfo | null {
  if (bytes.byteLength < HEADER_BYTES) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(v.getUint8(offset), v.getUint8(offset + 1), v.getUint8(offset + 2), v.getUint8(offset + 3));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE" || tag(12) !== "fmt " || tag(36) !== "data") return null;
  if (v.getUint16(20, true) !== 1) return null; // not PCM
  const channels = v.getUint16(22, true);
  const sampleRate = v.getUint32(24, true);
  const bits = v.getUint16(34, true);
  const dataBytes = v.getUint32(40, true);
  if (!channels || !sampleRate || bits !== 16) return null;
  if (HEADER_BYTES + dataBytes > bytes.byteLength) return null; // header claims more audio than was sent
  return { sampleRate, channels, bits, seconds: dataBytes / (sampleRate * channels * (bits / 8)) };
}

/** "0:07" style clock for the recording timer. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

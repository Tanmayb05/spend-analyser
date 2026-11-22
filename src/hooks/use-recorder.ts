"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { speechErrorMessage } from "@/lib/speech";
import { downsample, encodeWav, VOICE_MAX_SECONDS, VOICE_MIN_SECONDS, VOICE_SAMPLE_RATE } from "@/lib/voice";

// Runs on the audio thread and hands each block of microphone samples back to the page.
const TAP_SOURCE = `class VoiceTap extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor("voice-tap", VoiceTap);`;

type Session = {
  stream: MediaStream;
  ctx: AudioContext;
  node: AudioWorkletNode;
  chunks: Float32Array[];
  samples: number;
  timer: ReturnType<typeof setInterval>;
};

function release(s: Session) {
  clearInterval(s.timer);
  s.node.port.onmessage = null;
  s.node.disconnect();
  s.stream.getTracks().forEach((t) => t.stop());
  void s.ctx.close();
}

function canRecord() {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof AudioContext !== "undefined" && typeof AudioWorkletNode !== "undefined";
}
const noopSubscribe = () => () => {};

type Options = {
  /** Called with the finished clip (16 kHz mono WAV) once recording stops. */
  onDone: (wav: Blob) => void;
  onError: (message: string) => void;
};

/**
 * Records the microphone as a WAV clip. Stops by itself at the length limit. The page never keeps the audio:
 * it is handed to `onDone` once and the microphone is released straight away.
 */
export function useRecorder(options: Options) {
  const supported = useSyncExternalStore(noopSubscribe, canRecord, () => false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const session = useRef<Session | null>(null);
  const starting = useRef(false);
  const cb = useRef(options);

  useEffect(() => {
    cb.current = options;
  }, [options]);
  useEffect(
    () => () => {
      if (session.current) release(session.current);
    },
    [],
  );

  function stop() {
    const s = session.current;
    if (!s) return;
    session.current = null;
    release(s);
    setRecording(false);
    setSeconds(0);

    const pcm = new Float32Array(s.samples);
    let at = 0;
    for (const c of s.chunks) {
      pcm.set(c, at);
      at += c.length;
    }
    const mono = downsample(pcm, s.ctx.sampleRate, VOICE_SAMPLE_RATE).subarray(0, VOICE_MAX_SECONDS * VOICE_SAMPLE_RATE);
    if (mono.length / VOICE_SAMPLE_RATE < VOICE_MIN_SECONDS) return cb.current.onError("That was too short. Hold on a little longer and say the whole entry.");
    cb.current.onDone(new Blob([encodeWav(mono)], { type: "audio/wav" }));
  }

  async function start() {
    if (session.current || starting.current) return;
    starting.current = true;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      ctx = new AudioContext();
      const url = URL.createObjectURL(new Blob([TAP_SOURCE], { type: "text/javascript" }));
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      const node = new AudioWorkletNode(ctx, "voice-tap");
      const rate = ctx.sampleRate;
      const s: Session = { stream, ctx, node, chunks: [], samples: 0, timer: setInterval(() => setSeconds(Math.floor(s.samples / rate)), 250) };
      node.port.onmessage = (e: MessageEvent<Float32Array>) => {
        s.chunks.push(e.data);
        s.samples += e.data.length;
        if (s.samples / rate >= VOICE_MAX_SECONDS) stop();
      };
      ctx.createMediaStreamSource(stream).connect(node);
      node.connect(ctx.destination); // the tap writes no output, so this is silent; some browsers only run connected nodes
      session.current = s;
      setRecording(true);
    } catch (e) {
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      const name = (e as Error)?.name;
      const code = name === "NotAllowedError" || name === "SecurityError" ? "not-allowed" : name === "NotFoundError" ? "audio-capture" : "unknown";
      cb.current.onError(speechErrorMessage(code) ?? "");
    } finally {
      starting.current = false;
    }
  }

  return { supported, recording, seconds, start, stop };
}

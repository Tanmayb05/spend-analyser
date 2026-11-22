"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { joinTranscript, speechErrorMessage } from "@/lib/speech";

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  /** On-device recognition. Only present in browsers that implement it. */
  processLocally?: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
type Ctor = new () => Recognition;

function speechCtor(): Ctor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}
const noopSubscribe = () => () => {};

type Options = {
  /** Called with the whole transcript so far (interim results included) every time it changes. */
  onText: (text: string) => void;
  onError?: (message: string) => void;
  /** Called once the session has fully ended, whether the user stopped it or the browser did. */
  onEnd?: () => void;
};

/**
 * Browser speech-to-text (Web Speech API). `supported` is false on browsers without it.
 * Keeps listening through pauses until the user stops it. Prefers on-device recognition where the
 * browser offers it and falls back to the browser's speech service when the language pack is missing.
 * `local` says which one the current session is using.
 */
export function useSpeech(options: Options) {
  const supported = useSyncExternalStore(noopSubscribe, () => Boolean(speechCtor()), () => false);
  const [listening, setListening] = useState(false);
  const [local, setLocal] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const cb = useRef(options);

  useEffect(() => {
    cb.current = options;
  }, [options]);
  useEffect(() => () => rec.current?.stop(), []);

  function begin(C: Ctor, tryLocal: boolean) {
    const r = new C();
    r.lang = navigator.language || "en-US";
    r.interimResults = true;
    r.continuous = true;
    const onDevice = tryLocal && "processLocally" in r;
    if (onDevice) r.processLocally = true;

    let retryOnline = false;
    r.onresult = (e) => cb.current.onText(joinTranscript(e.results));
    r.onerror = (e) => {
      if (onDevice && e.error === "language-not-supported") {
        retryOnline = true; // no on-device language pack: use the browser's speech service instead
        return;
      }
      const msg = speechErrorMessage(e.error);
      if (msg) cb.current.onError?.(msg);
    };
    r.onend = () => {
      if (retryOnline) return begin(C, false);
      setListening(false);
      setLocal(false);
      cb.current.onEnd?.();
    };

    try {
      r.start();
    } catch {
      if (onDevice) return begin(C, false);
      setListening(false);
      cb.current.onError?.(speechErrorMessage("unknown") ?? "");
      return;
    }
    rec.current = r;
    setListening(true);
    setLocal(onDevice);
  }

  function toggle() {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const C = speechCtor();
    if (C) begin(C, true);
  }

  return { supported, listening, local, toggle };
}

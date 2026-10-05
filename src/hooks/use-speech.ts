"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null;
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

/** Browser speech-to-text (Web Speech API). `supported` is false on browsers without it. */
export function useSpeech(onText: (t: string, final: boolean) => void) {
  const supported = useSyncExternalStore(noopSubscribe, () => Boolean(speechCtor()), () => false);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const cb = useRef(onText);

  useEffect(() => {
    cb.current = onText;
  }, [onText]);
  useEffect(() => () => rec.current?.stop(), []);

  function toggle() {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const C = speechCtor();
    if (!C) return;
    const r = (rec.current ??= new C());
    r.lang = navigator.language || "en-US";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      const res = Array.from(e.results);
      cb.current(res.map((x) => x[0].transcript).join(" "), Boolean(res.at(-1)?.isFinal));
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    r.start();
    setListening(true);
  }

  return { supported, listening, toggle };
}

"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Mic, MicOff, Receipt } from "lucide-react";
import { useAppData } from "@/components/app-data";
import { useRecorder } from "@/hooks/use-recorder";
import { useSpeech } from "@/hooks/use-speech";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatClock } from "@/lib/voice";
import { transcribeAction } from "@/app/(app)/ai/actions";

/**
 * "Describe it" box: type or say what you spent. Voice only fills the box; the user checks the words, then presses Enter or "Read it".
 * Controlled so the caller can keep the text if the AI can't read it.
 */
export function DescribeInput({
  text,
  onText,
  onRun,
  running,
  onReceipt,
}: {
  text: string;
  onText: (t: string) => void;
  onRun: (t: string) => void;
  running: boolean;
  onReceipt: () => void;
}) {
  const app = useAppData();
  const [transcribing, startTranscribe] = useTransition();

  const base = useRef("");
  const input = useRef<HTMLInputElement>(null);
  const fill = (spoken: string) => onText([base.current, spoken].filter(Boolean).join(" "));

  // Browser speech recognition: free, nothing leaves the app, but it depends on the browser.
  const speech = useSpeech({
    onText: fill,
    onError: (m) => toast.error(m),
    onEnd: () => input.current?.focus(),
  });
  // Server transcription: same result in every browser. Used when the AI provider can transcribe (not Claude).
  const recorder = useRecorder({
    onDone: (wav) =>
      startTranscribe(async () => {
        const form = new FormData();
        form.append("audio", wav, "voice.wav");
        const res = await transcribeAction(form);
        if (!res.ok) return void toast.error(res.error);
        fill(res.text);
        input.current?.focus();
      }),
    onError: (m) => toast.error(m),
  });

  const server = app.voiceReady && recorder.supported;
  const listening = server ? recorder.recording : speech.listening;
  const micAvailable = server || speech.supported;
  const busy = running || transcribing;
  const toggleMic = () => {
    if (!listening) base.current = text.trim(); // keep what was already typed
    if (!server) return speech.toggle();
    if (recorder.recording) recorder.stop();
    else void recorder.start();
  };

  return (
    <div className="rounded-card border border-border bg-surface-2 p-compact">
      <div className="flex items-center gap-2">
        <input
          ref={input}
          autoFocus
          aria-label="Describe a transaction"
          value={text}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (text.trim() && !busy) onRun(text);
          }}
          placeholder={listening ? "Listening…" : transcribing ? "Transcribing…" : "e.g. 12.50 Kroger groceries yesterday"}
          className="h-10 min-w-0 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-faint"
          disabled={running}
          readOnly={transcribing}
        />
        {server && recorder.recording ? <span className="shrink-0 text-xs tabular-nums text-muted">{formatClock(recorder.seconds)}</span> : null}
        {micAvailable ? (
          <button
            type="button"
            onClick={toggleMic}
            disabled={transcribing}
            aria-label={listening ? "Stop listening" : "Speak"}
            aria-pressed={listening}
            className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-control transition-colors disabled:opacity-50", listening ? "bg-surface-3 text-bad" : "text-muted hover:bg-surface-3")}
          >
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
        ) : null}
        <button type="button" onClick={onReceipt} aria-label="Read a receipt" className="grid h-9 w-9 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-surface-3">
          <Receipt size={18} />
        </button>
        <Button size="sm" onClick={() => text.trim() && onRun(text)} disabled={!text.trim() || busy}>
          {running ? "Reading…" : "Read it"}
        </Button>
      </div>
      <p className="mt-2 px-1 text-xs leading-relaxed text-muted">
        Type{micAvailable ? " or say" : ""} what you spent: amount, place, when. Several entries at once work too. The receipt icon reads a bill.
        {server
          ? " Your recording is sent to the AI provider to transcribe and isn't saved in the app."
          : speech.supported
            ? speech.local
              ? " Voice is transcribed on this device."
              : " Voice is transcribed by your browser's speech service."
            : ""}
      </p>
    </div>
  );
}

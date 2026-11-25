"use client";

/**
 * Single-file drop zone.
 * Source: Kokonut UI "File Upload" v2 (https://kokonutui.com/r/file-upload.json, MIT, @dorianbaffier),
 * copied 2026-11-25. Kokonut has no versioned releases; this file is ours now.
 * Changes from the original: kept the drop zone only (a file dragged anywhere over the window wakes it,
 * a drop that misses it doesn't navigate away, paste works, type and size are checked). Dropped the
 * upload queue, progress rows, retries and previews: our callers read the file in the browser, so there
 * is nothing to upload. App tokens instead of zinc/dark: classes; one file at a time.
 */

import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const FILE_SIZES = ["B", "KB", "MB", "GB"] as const;

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), FILE_SIZES.length - 1);
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? Math.round(value) : Number(value.toFixed(1))} ${FILE_SIZES[i]}`;
}

/** Extensions (".csv") only, like the input's `accept` attribute. */
const matches = (file: File, accept: string[]) => !accept.length || accept.some((a) => file.name.toLowerCase().endsWith(a.toLowerCase()));

const isFileDrag = (e: { dataTransfer: DataTransfer | null }) => Boolean(e.dataTransfer?.types.includes("Files"));

export function FileDrop({
  accept,
  maxFileSize = Infinity,
  onFile,
  label,
  icon,
  title,
  hint,
}: {
  /** Extensions, e.g. [".xlsx", ".csv"]. */
  accept: string[];
  maxFileSize?: number;
  onFile: (file: File) => void;
  /** Accessible name of the hidden file input. */
  label: string;
  /** Icon shown in the tile when not dragging (defaults to an upload arrow). */
  icon?: ReactNode;
  /** Main line when idle, e.g. the chosen file's name. Defaults to "Drop a file here or browse". */
  title?: ReactNode;
  hint?: ReactNode;
}) {
  const hintId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [windowDrag, setWindowDrag] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A file dragged anywhere over the window wakes the drop zone, and a drop that misses it does not make the browser navigate away to the file.
  useEffect(() => {
    let depth = 0;
    const onEnter = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      depth += 1;
      setWindowDrag(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setWindowDrag(false);
    };
    const onOver = (e: DragEvent) => {
      if (isFileDrag(e)) e.preventDefault();
    };
    const onEnd = (e: DragEvent) => {
      if (isFileDrag(e)) e.preventDefault();
      depth = 0;
      setWindowDrag(false);
      setOver(false);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onEnd);
    window.addEventListener("dragend", onEnd);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onEnd);
      window.removeEventListener("dragend", onEnd);
    };
  }, []);

  function take(files: FileList | null | undefined) {
    const file = files?.[0];
    if (!file) return;
    if (!matches(file, accept)) return setError(`Not a ${accept.map((a) => a.slice(1).toUpperCase()).join(", ")} file`);
    if (file.size > maxFileSize) return setError(`Larger than ${formatBytes(maxFileSize)}`);
    setError(null);
    onFile(file);
  }

  const dragOver = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setOver(true);
  };

  const heading = over ? "Release to add the file" : windowDrag ? "Drop the file here" : (title ?? <>Drop a file here or <span className="underline decoration-border underline-offset-4 transition-[text-decoration-color] group-hover/zone:decoration-text">browse</span></>);

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept={accept.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-label={label}
        onChange={(e) => {
          take(e.target.files);
          e.target.value = ""; // choosing the same file again should re-read it
        }}
      />
      <button
        type="button"
        aria-describedby={hint ? hintId : undefined}
        onClick={() => input.current?.click()}
        onDragEnter={dragOver}
        onDragOver={dragOver}
        onDragLeave={(e) => {
          if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
          setOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          setWindowDrag(false);
          take(e.dataTransfer.files);
        }}
        onPaste={(e) => {
          if (!e.clipboardData.files.length) return;
          e.preventDefault();
          take(e.clipboardData.files);
        }}
        className={cn(
          "group/zone flex w-full flex-col items-center gap-3 rounded-card border border-dashed px-6 py-8 text-center transition-[background-color,border-color]",
          over ? "border-solid border-accent bg-accent/10" : windowDrag ? "border-accent bg-surface-2" : "border-border hover:bg-surface-2",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "flex size-9 items-center justify-center rounded-control border bg-surface transition-[border-color,color]",
            over || windowDrag ? "border-accent text-accent" : "border-border text-muted",
          )}
        >
          {over || windowDrag ? <Upload size={16} className="motion-safe:-translate-y-0.5 transition-[translate]" /> : (icon ?? <Upload size={16} />)}
        </span>
        <span className="flex flex-col gap-1">
          <span className="font-medium">{heading}</span>
          {hint ? (
            <span id={hintId} className="text-xs text-muted">
              {hint}
            </span>
          ) : null}
        </span>
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}

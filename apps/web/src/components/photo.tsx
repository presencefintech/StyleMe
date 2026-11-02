"use client";

import { useEffect, useId, useRef, useState } from "react";

export const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
export const MAX_BYTES = 10 * 1024 * 1024;

export function validatePhoto(file: { type: string; size: number }): string | null {
  if (!ACCEPTED.includes(file.type)) return "Format non supporté (JPEG, PNG ou WebP).";
  if (file.size > MAX_BYTES) return "Photo trop lourde (10 Mo maximum).";
  return null;
}

export function PhotoPicker({ file, onPick, disabled }: { file: File | null; onPick: (f: File | null) => void; disabled?: boolean }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div>
      <label
        htmlFor={id}
        className="flex min-h-56 cursor-pointer flex-col items-center justify-center gap-sm overflow-hidden rounded-lg border-2 border-dashed border-line bg-bg-surface text-center transition hover:border-primary focus-within:border-primary"
      >
        {preview ? (
          <img src={preview} alt="Aperçu de votre photo" className="max-h-80 w-full object-contain" />
        ) : (
          <>
            <span aria-hidden className="text-display">📷</span>
            <span className="text-body font-semibold text-ink">Choisir une photo</span>
            <span className="text-caption text-ink-muted">JPEG, PNG ou WebP · 10 Mo max · un seul visage, adulte</span>
          </>
        )}
      </label>
      <input
        id={id}
        ref={input}
        type="file"
        accept={ACCEPTED.join(",")}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          const problem = f ? validatePhoto(f) : null;
          setError(problem);
          onPick(problem ? null : f);
          if (problem && input.current) input.current.value = "";
        }}
      />
      {error && <p role="alert" className="mt-sm text-caption text-danger">{error}</p>}
    </div>
  );
}

/** Avant/après : curseur de comparaison accessible (input range). */
export function ResultViewer({ before, after }: { before: string | null; after: string }) {
  const [pos, setPos] = useState(50);
  if (!before) {
    return <img src={after} alt="Résultat" className="w-full rounded-lg bg-bg-alt object-contain" />;
  }
  return (
    <div>
      <div className="relative overflow-hidden rounded-lg bg-bg-alt">
        <img src={after} alt="Après" className="block w-full object-contain" />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <img src={before} alt="Avant" className="h-full w-full object-contain" />
        </div>
        <div aria-hidden className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${pos}%` }} />
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Comparer avant et après"
        className="mt-md w-full accent-primary"
      />
    </div>
  );
}

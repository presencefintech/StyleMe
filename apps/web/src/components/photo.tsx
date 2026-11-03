"use client";

import { useEffect, useId, useRef, useState } from "react";
import { canShareFiles, saveImage, shareImage } from "@/lib/files";

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
        className="flex min-h-64 cursor-pointer flex-col items-center justify-center gap-sm overflow-hidden rounded-xl border-2 border-dashed border-line bg-bg-surface p-lg text-center shadow-card transition hover:border-primary hover:bg-primary/5 focus-within:border-primary"
      >
        {preview ? (
          <img src={preview} alt="Aperçu de votre photo" className="max-h-80 w-full object-contain" />
        ) : (
          <>
            <span aria-hidden className="grid h-14 w-14 place-items-center rounded-pill bg-primary/10 text-display text-primary">＋</span>
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

/** Avant/après : on glisse sur la photo (souris ou doigt) ou on utilise le curseur (accessible au clavier). */
export function ResultViewer({ before, after }: { before: string | null; after: string }) {
  const [pos, setPos] = useState(50);
  const [beforeBroken, setBeforeBroken] = useState(false); // URL signée expirée : on n'affiche que le résultat
  const frame = useRef<HTMLDivElement>(null);
  if (!before || beforeBroken) {
    return <img src={after} alt="Résultat" className="w-full rounded-xl bg-bg-alt object-contain shadow-card" />;
  }
  function moveTo(clientX: number) {
    const r = frame.current?.getBoundingClientRect();
    if (r && r.width > 0) setPos(Math.min(100, Math.max(0, Math.round(((clientX - r.left) / r.width) * 100))));
  }
  return (
    <div>
      <div
        ref={frame}
        className="relative touch-pan-y select-none overflow-hidden rounded-xl bg-bg-alt shadow-card"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); moveTo(e.clientX); }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) moveTo(e.clientX); }}
      >
        <img src={after} alt="Après" draggable={false} className="block w-full object-contain" />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <img src={before} alt="Avant" draggable={false} onError={() => setBeforeBroken(true)} className="h-full w-full object-contain" />
        </div>
        <span className="pointer-events-none absolute left-2 top-2 rounded-pill bg-black/70 px-2 py-1 text-xs font-semibold text-white">Avant</span>
        <span className="pointer-events-none absolute right-2 top-2 rounded-pill bg-black/70 px-2 py-1 text-xs font-semibold text-white">Après</span>
        <div aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-card" style={{ left: `${pos}%` }}>
          <span className="absolute left-1/2 top-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-pill bg-white text-sm font-bold text-ink shadow-card">↔</span>
        </div>
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

/** Téléchargement en pleine résolution, et partage direct (WhatsApp…) quand le téléphone le permet. */
export function ResultActions({ url }: { url: string }) {
  const [busy, setBusy] = useState<"save" | "share" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(canShareFiles()), []);

  async function run(kind: "save" | "share") {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "save") await saveImage(url);
      else await shareImage(url);
    } catch {
      setError("Le partage a échoué. Utilisez « Télécharger » puis envoyez la photo depuis votre galerie.");
    } finally {
      setBusy(null);
    }
  }
  const btn = "inline-flex min-h-11 items-center justify-center rounded-sm px-xl font-semibold transition disabled:opacity-60";
  return (
    <div>
      <div className="flex flex-wrap gap-sm">
        <button type="button" disabled={busy !== null} onClick={() => run("save")} className={btn + " bg-ink text-bg hover:bg-ink/85"}>
          {busy === "save" ? "Préparation…" : "Télécharger en HD"}
        </button>
        {canShare && (
          <button type="button" disabled={busy !== null} onClick={() => run("share")} className={btn + " border border-ink/70 text-ink hover:bg-bg-alt"}>
            {busy === "share" ? "Préparation…" : "Partager (WhatsApp…)"}
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-sm text-caption text-danger">{error}</p>}
    </div>
  );
}

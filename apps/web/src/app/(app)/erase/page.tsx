"use client";

import { useQueryClient } from "@tanstack/react-query";
import { JOB_BASE_COST } from "@styleme/shared";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { PhotoPicker } from "@/components/photo";
import { Button, Card, ErrorNote, Screen } from "@/components/ui";
import { ApiError, errorMessage, type SegmentResult, type SegmentTarget } from "@/lib/api";
import { toDataUrl } from "@/lib/files";
import { keys, useBalance } from "@/features/queries";
import { useApi } from "@/lib/providers";

const COST = JOB_BASE_COST.ERASE;
/** Un glisser de moins que ça (en pixels) reste un simple clic. */
const DRAG_MIN_PX = 6;
/** Un survol qui a bougé de moins que ça (fraction de l'image) ne relance pas de recherche. */
const HOVER_MIN_MOVE = 0.012;

interface Source {
  assetId: string;
  /** URL d'affichage (aperçu local ou URL signée). */
  url: string;
  /** Aperçu « avant » stable pour la page résultat (data URL si la photo vient de l'ordinateur). */
  before: string;
}

/** Position du pointeur en coordonnées normalisées (0..1) de l'image, ou null si elle n'est pas fiable. */
function pointerToImage(e: { clientX: number; clientY: number; currentTarget: HTMLElement }): { x: number; y: number } | null {
  const r = e.currentTarget.getBoundingClientRect();
  // Image sans taille (rechargement en cours…) : on ignore, sinon x/y = NaN et l'API rejette la requête.
  if (!(r.width > 0 && r.height > 0)) return null;
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.min(Math.max(x, 0), 1), y: Math.min(Math.max(y, 0), 1) };
}

function EraseTool() {
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const balance = useBalance();
  const fromJob = useSearchParams().get("job");

  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [selection, setSelection] = useState<SegmentResult | null>(null);
  const [locked, setLocked] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [tap, setTap] = useState<{ x: number; y: number } | null>(null);
  const [step, setStep] = useState<"idle" | "uploading" | "erasing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [needCredits, setNeedCredits] = useState(false);

  // Recherche d'objet : le DERNIER appel gagne, un seul survol en vol à la fois (le plus récent attend son tour).
  const seq = useRef(0);
  const inFlight = useRef(false);
  const pendingHover = useRef<SegmentTarget | null>(null);
  const lastHover = useRef<{ x: number; y: number } | null>(null);
  const lockedRef = useRef(false);

  // Tracé d'un rectangle à la souris ou au doigt (comme une capture d'écran).
  const dragStart = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const dragging = useRef(false);
  const justDragged = useRef(false);
  const [dragBox, setDragBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  // Arrivée depuis un résultat : on continue de gommer sur cette image.
  useEffect(() => {
    if (!fromJob) return;
    let cancelled = false;
    setStep("uploading");
    api
      .jobAsAsset(fromJob)
      .then((r) => {
        if (cancelled) return;
        setSource({ assetId: r.assetId, url: r.url, before: r.url });
        void api.prepare(r.assetId).catch(() => {});
      })
      .catch((e) => { if (!cancelled) setError(errorMessage(e)); })
      .finally(() => { if (!cancelled) setStep("idle"); });
    return () => { cancelled = true; };
  }, [fromJob, api]);

  // Photo choisie sur l'ordinateur : envoi immédiat, puis analyse en arrière-plan (le 1er survol sera rapide).
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      setStep("uploading");
      setError(null);
      try {
        const { assetId, uploadUrl } = await api.presign("SOURCE");
        await api.uploadToSignedUrl(uploadUrl, file);
        const before = await toDataUrl(file);
        if (cancelled) return;
        setSource({ assetId, url: before, before });
        void api.prepare(assetId).catch(() => {});
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      } finally {
        if (!cancelled) setStep("idle");
      }
    })();
    return () => { cancelled = true; };
  }, [file, api]);

  async function runSelection(target: SegmentTarget, kind: "hover" | "click") {
    if (!source) return;
    if (kind === "hover") {
      if (inFlight.current) { pendingHover.current = target; return; }
    } else {
      pendingHover.current = null;
    }
    const id = ++seq.current;
    inFlight.current = true;
    setSelecting(true);
    try {
      const result = await api.segment(source.assetId, target);
      if (id === seq.current) { setSelection(result); setError(null); }
    } catch (err) {
      if (id === seq.current) {
        setSelection(null);
        // Au survol, « aucun objet ici » est normal (on passe sur le fond) : pas de message.
        const silent = kind === "hover" && err instanceof ApiError && err.code === "NoObjectFound";
        if (!silent) setError(errorMessage(err));
      }
    } finally {
      inFlight.current = false;
      if (id === seq.current) { setSelecting(false); setTap(null); }
      const next = pendingHover.current;
      if (next && !lockedRef.current) { pendingHover.current = null; void runSelection(next, "hover"); }
    }
  }

  // Souris : l'objet sous le curseur s'illumine pendant qu'on le survole (comme une baguette magique).
  function onHover(e: PointerEvent<HTMLImageElement>) {
    if (e.pointerType !== "mouse" || lockedRef.current || step === "erasing" || step === "uploading") return;
    const p = pointerToImage(e);
    if (!p) return;
    const last = lastHover.current;
    if (last && Math.abs(p.x - last.x) < HOVER_MIN_MOVE && Math.abs(p.y - last.y) < HOVER_MIN_MOVE) return;
    lastHover.current = p;
    void runSelection(p, "hover");
  }

  function onDown(e: PointerEvent<HTMLImageElement>) {
    justDragged.current = false;
    if (e.button !== 0 || !source || step === "erasing" || step === "uploading") return;
    const p = pointerToImage(e);
    if (!p) return;
    dragStart.current = { ...p, cx: e.clientX, cy: e.clientY };
    dragging.current = false;
    try {
      e.currentTarget.setPointerCapture(e.pointerId); // on continue de suivre le rectangle même hors de la photo
    } catch { /* capture indisponible : le tracé fonctionne quand même tant que le pointeur reste sur la photo */ }
  }

  function onMove(e: PointerEvent<HTMLImageElement>) {
    const start = dragStart.current;
    if (!start) return onHover(e);
    if (!dragging.current && Math.max(Math.abs(e.clientX - start.cx), Math.abs(e.clientY - start.cy)) < DRAG_MIN_PX) return;
    const p = pointerToImage(e);
    if (!p) return;
    if (!dragging.current) {
      dragging.current = true;
      pendingHover.current = null;
      seq.current++; // un survol en cours ne doit pas écraser le rectangle
      setSelection(null);
      setSelecting(false);
    }
    setDragBox({ x0: Math.min(start.x, p.x), y0: Math.min(start.y, p.y), x1: Math.max(start.x, p.x), y1: Math.max(start.y, p.y) });
  }

  function onUp(e: PointerEvent<HTMLImageElement>) {
    const start = dragStart.current;
    dragStart.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    } catch { /* rien à relâcher */ }
    if (!start || !dragging.current) return; // simple clic : géré par onSelect
    dragging.current = false;
    justDragged.current = true; // le « click » qui suit le relâchement ne doit pas sélectionner un objet
    const box = dragBox;
    setDragBox(null);
    if (!box) return;
    lockedRef.current = true;
    setLocked(true);
    setError(null);
    void runSelection({ box }, "click");
  }

  function onCancel() {
    dragStart.current = null;
    dragging.current = false;
    setDragBox(null);
  }

  function onLeave() {
    if (lockedRef.current) return;
    pendingHover.current = null;
    lastHover.current = null;
    seq.current++; // une réponse tardive ne doit pas rallumer un objet que la souris a quitté
    setSelection(null);
    setSelecting(false);
  }

  // Clic ou toucher : verrouille la sélection (onClick, et non pointerup : un défilement au doigt ne sélectionne rien).
  function onSelect(e: MouseEvent<HTMLImageElement>) {
    if (justDragged.current) return; // fin d'un tracé de rectangle, pas un clic
    if (!source || step === "erasing" || step === "uploading") return;
    const p = pointerToImage(e);
    if (!p) return;
    lockedRef.current = true;
    setLocked(true);
    setTap(p);
    setError(null);
    void runSelection(p, "click");
  }

  function unlock() {
    lockedRef.current = false;
    lastHover.current = null;
    seq.current++;
    setLocked(false);
    setSelection(null);
    setSelecting(false);
    setError(null);
  }

  async function erase() {
    if (!selection || !source || !locked) return;
    setStep("erasing");
    setError(null);
    setNeedCredits(false);
    try {
      const { imageAssetId, maskAssetId } = await api.commitSelection(source.assetId, selection.selectionId);
      const { jobId } = await api.createJob({ type: "ERASE", inputAssetIds: [imageAssetId, maskAssetId] });
      void qc.invalidateQueries({ queryKey: keys.jobs });
      try { sessionStorage.setItem(`before:${jobId}`, source.before); } catch { /* quota/privé */ }
      router.push(`/jobs/${jobId}`);
    } catch (e) {
      setNeedCredits(e instanceof ApiError && e.status === 402);
      if (e instanceof ApiError && e.code === "SelectionExpired") unlock();
      setError(errorMessage(e));
      setStep("idle");
    }
  }

  function reset() {
    lockedRef.current = false;
    lastHover.current = null;
    seq.current++;
    setFile(null);
    setSource(null);
    setSelection(null);
    setLocked(false);
    setError(null);
    if (fromJob) router.replace("/erase");
  }

  const lacking = balance.data !== undefined && balance.data.balance < COST;
  const busy = step !== "idle";
  const hint = locked
    ? selecting
      ? "Recherche de l'objet…"
      : selection
        ? "Sélection verrouillée : la zone entourée de blanc sera effacée. Pas la bonne ? Cliquez ou tracez ailleurs."
        : "Cliquez sur l'objet, ou tracez un rectangle autour de ce que vous voulez enlever."
    : "Cliquez sur un objet, ou tracez un rectangle autour de ce que vous voulez enlever, comme une capture d'écran.";

  return (
    <Screen
      eyebrow="Gomme magique"
      title="Touchez l'objet à enlever"
      subtitle="Choisissez une photo, puis cliquez sur l'objet ou tracez un rectangle autour de ce que vous voulez enlever. Confirmez, et il disparaît."
      compact={!!source}
    >
      {lacking && (
        <Card className="flex items-center justify-between gap-md border-accent/40">
          <span className="text-body">Il vous faut {COST} crédit pour gommer un objet.</span>
          <Link href="/credits" className="font-semibold text-accent-ink underline">Recharger</Link>
        </Card>
      )}

      {!source && !fromJob && <PhotoPicker file={file} onPick={setFile} disabled={busy} />}
      {step === "uploading" && <p role="status" className="text-caption text-ink-muted">Préparation de la photo…</p>}

      {source && (
        <>
          {/* Actions AU-DESSUS de la photo, fixées sous l'en-tête : toujours visibles, et elles ne cachent jamais l'image. */}
          <div className="sticky top-[4.5rem] z-20 space-y-sm rounded-xl border border-line bg-bg/95 p-sm shadow-card backdrop-blur">
            <p role="status" className="px-xs text-caption text-ink-muted">{hint}</p>
            <div className="flex gap-sm">
              <Button onClick={erase} disabled={!locked || !selection || selecting || busy || lacking} loading={step === "erasing"} className="flex-1">
                Enlever cet objet ({COST} ✦)
              </Button>
              {locked && <Button variant="secondary" onClick={unlock} disabled={busy} className="px-lg">Désélectionner</Button>}
              <Button variant="secondary" onClick={reset} disabled={busy} className="px-lg">Changer</Button>
            </div>
          </div>

          <ErrorNote message={error} />
          {needCredits && <Link href="/credits" className="text-accent-ink underline">Acheter des crédits</Link>}

          <div className="flex justify-center overflow-hidden rounded-xl bg-bg-alt shadow-card">
            {/* Ce conteneur épouse exactement l'image (pas de bandes) : la position du pointeur correspond à celle de la photo. */}
            <div className="relative inline-block max-w-full">
              {/* La photo ne change JAMAIS de source : l'aperçu est une couche par-dessus (sinon l'image se vide un instant au rechargement). */}
              <img
                src={source.url}
                alt="Votre photo : cliquez sur un objet ou tracez un rectangle autour de ce que vous voulez enlever"
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onCancel}
                onPointerLeave={onLeave}
                onClick={onSelect}
                draggable={false}
                className="block h-auto max-h-[max(16rem,calc(100dvh-27rem))] w-auto max-w-full cursor-crosshair select-none md:max-h-[max(18rem,calc(100vh-22rem))]"
                style={{ touchAction: "none" }} // permet de tracer au doigt sans faire défiler la page
              />
              {selection && (
                <img
                  src={selection.overlayUrl}
                  alt=""
                  aria-hidden
                  draggable={false}
                  className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
                />
              )}
              {dragBox && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute border-2 border-dashed border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
                  style={{ left: `${dragBox.x0 * 100}%`, top: `${dragBox.y0 * 100}%`, width: `${(dragBox.x1 - dragBox.x0) * 100}%`, height: `${(dragBox.y1 - dragBox.y0) * 100}%` }}
                />
              )}
              {tap && selecting && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-pill border-4 border-white bg-primary/40"
                  style={{ left: `${tap.x * 100}%`, top: `${tap.y * 100}%` }}
                />
              )}
            </div>
          </div>
        </>
      )}
      {!source && <ErrorNote message={error} />}

      <p className="text-center text-tiny text-ink-muted">
        Vos photos restent privées. Le crédit n'est débité que si le résultat vous est livré.
      </p>
    </Screen>
  );
}

export default function ErasePage() {
  return (
    <Suspense fallback={null}>
      <EraseTool />
    </Suspense>
  );
}

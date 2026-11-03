"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  ACCESSORIES,
  BACKGROUND_PRESETS,
  COLLECTIONS,
  HAIRSTYLES,
  LOOK_STEP_COST,
  MAKEUPS,
  MAX_ACCESSORIES,
  lookCost,
  type Collection,
} from "@styleme/shared";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState, type ReactNode } from "react";
import { PhotoPicker } from "@/components/photo";
import { Button, Card, ErrorNote, Screen, cx } from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { toDataUrl } from "@/lib/files";
import { keys, useBalance, useGarments, useStyles } from "@/features/queries";
import { useApi } from "@/lib/providers";

const STEPS = ["Événement", "Tenue", "Coiffure", "Maquillage", "Photo"] as const;

function Tile({ selected, disabled, onClick, children }: { selected: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        "block w-full rounded-md border bg-bg-surface px-md py-lg text-left text-body font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
        selected ? "border-primary ring-2 ring-primary" : "border-line hover:border-primary/50",
      )}
    >
      {children}
    </button>
  );
}

const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

function LookPage() {
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const balance = useBalance();
  const garments = useGarments();
  const styles = useStyles();
  const params = useSearchParams();

  // « Essayer ce look » arrive ici avec tout prérempli.
  const [step, setStep] = useState(0);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [styleId, setStyleId] = useState<string | null>(params.get("style") && (params.get("style")! in BACKGROUND_PRESETS) ? params.get("style") : null);
  const [garmentId, setGarmentId] = useState<string | null>(params.get("garment"));
  const [hairstyleId, setHairstyleId] = useState<string | null>(HAIRSTYLES.some((h) => h.id === params.get("hair")) ? params.get("hair") : null);
  const [makeupId, setMakeupId] = useState<string | null>(MAKEUPS.some((m) => m.id === params.get("makeup")) ? params.get("makeup") : null);
  const [accessoryIds, setAccessoryIds] = useState<string[]>(list(params.get("acc")).filter((id) => ACCESSORIES.some((a) => a.id === id)).slice(0, MAX_ACCESSORIES));
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "creating">("idle");
  const [error, setError] = useState<string | null>(null);
  const [needCredits, setNeedCredits] = useState(false);

  const garmentList = garments.data ?? [];
  // Une tenue retirée du catalogue depuis la publication d'un look ne peut plus être essayée.
  const garment = garmentId && garmentList.find((g) => g.id === garmentId) ? garmentId : null;
  const occasions = (styles.data ?? []).filter((s) => s.kind === "OCCASION" && s.id in BACKGROUND_PRESETS);

  const steps = { garmentId: garment ?? undefined, hairstyleId: hairstyleId ?? undefined, makeupId: makeupId ?? undefined, accessoryIds, styleId: styleId ?? undefined };
  const cost = lookCost(steps);
  const lacking = balance.data !== undefined && balance.data.balance < cost;
  const busy = phase !== "idle";

  const breakdown = useMemo(
    () =>
      [
        garment && { label: "Tenue", cost: LOOK_STEP_COST.garment },
        hairstyleId && { label: "Coiffure", cost: LOOK_STEP_COST.hairstyle },
        makeupId && { label: "Maquillage", cost: LOOK_STEP_COST.makeup },
        accessoryIds.length > 0 && { label: "Accessoires", cost: LOOK_STEP_COST.accessories },
        styleId && { label: "Décor de l'événement", cost: LOOK_STEP_COST.occasion },
      ].filter((x): x is { label: string; cost: number } => Boolean(x)),
    [garment, hairstyleId, makeupId, accessoryIds, styleId],
  );

  function applyCollection(c: Collection | null) {
    setCollectionId(c?.id ?? null);
    setStyleId(c?.styleId ?? null);
    setHairstyleId(c?.hairstyleId ?? null);
    setMakeupId(c?.makeupId ?? null);
    setAccessoryIds([...(c?.accessoryIds ?? [])]);
  }

  function toggleAccessory(id: string) {
    setAccessoryIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX_ACCESSORIES ? cur : [...cur, id]));
  }

  async function start() {
    if (!file || breakdown.length === 0) return;
    setError(null);
    setNeedCredits(false);
    try {
      setPhase("uploading");
      const { assetId, uploadUrl } = await api.presign("SOURCE");
      await api.uploadToSignedUrl(uploadUrl, file);
      setPhase("creating");
      const { jobId } = await api.createJob({ type: "LOOK", inputAssetIds: [assetId], ...steps });
      void qc.invalidateQueries({ queryKey: keys.jobs });
      try { sessionStorage.setItem(`before:${jobId}`, await toDataUrl(file)); } catch { /* quota/privé */ }
      router.push(`/jobs/${jobId}`);
    } catch (e) {
      setNeedCredits(e instanceof ApiError && e.status === 402);
      setError(errorMessage(e));
      setPhase("idle");
    }
  }

  const last = step === STEPS.length - 1;

  return (
    <Screen eyebrow="Mon look" title="Composez votre look" subtitle="Événement, tenue, coiffure, maquillage, accessoires : tout est appliqué sur votre photo, votre visage reste le vôtre.">
      <ol className="flex flex-wrap gap-sm" aria-label="Étapes">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => setStep(i)}
              disabled={busy}
              aria-current={i === step ? "step" : undefined}
              className={cx("min-h-10 rounded-sm border px-md text-caption font-semibold transition", i === step ? "border-ink bg-ink text-bg" : "border-line text-ink-muted hover:text-ink")}
            >
              {i + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-md">
          <h2 className="font-display text-h2 font-semibold">Choisissez une collection</h2>
          <p className="text-caption text-ink-muted">Une collection préremplit la coiffure, le maquillage, les accessoires et le décor. Vous pouvez tout modifier ensuite.</p>
          <ul className="grid gap-md sm:grid-cols-2">
            {COLLECTIONS.map((c) => (
              <li key={c.id}>
                <Tile selected={collectionId === c.id} disabled={busy} onClick={() => applyCollection(collectionId === c.id ? null : c)}>
                  <span className="block font-semibold">{c.name}</span>
                  <span className="mt-xs block text-caption font-normal text-ink-muted">{c.description}</span>
                </Tile>
              </li>
            ))}
          </ul>
          <p className="text-caption font-semibold uppercase tracking-widest text-ink-muted">Ou seulement le décor d'un événement</p>
          <ul className="grid grid-cols-2 gap-md sm:grid-cols-3">
            {occasions.map((o) => (
              <li key={o.id}>
                <Tile selected={styleId === o.id} disabled={busy} onClick={() => setStyleId(styleId === o.id ? null : o.id)}>{o.name}</Tile>
              </li>
            ))}
          </ul>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-md">
          <h2 className="font-display text-h2 font-semibold">Choisissez la tenue</h2>
          {garments.isLoading && <p className="text-ink-muted">Chargement du catalogue…</p>}
          {garments.isSuccess && garmentList.length === 0 && <Card><p className="text-ink-muted">Le catalogue de tenues arrive bientôt. Vous pouvez passer cette étape.</p></Card>}
          <ul className="grid grid-cols-2 gap-md sm:grid-cols-3">
            {garmentList.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={g.id === garment}
                  onClick={() => setGarmentId(g.id === garment ? null : g.id)}
                  className={cx("block w-full overflow-hidden rounded-md border bg-bg-surface text-left transition", g.id === garment ? "border-primary ring-2 ring-primary" : "border-line hover:border-primary/50")}
                >
                  <img src={g.previewUrl} alt={g.name} loading="lazy" className="aspect-[3/4] w-full bg-bg-alt object-contain" />
                  <span className="block px-sm py-xs text-caption font-medium text-ink">{g.name}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-tiny text-ink-muted">Cette étape est facultative. Pour une bonne tenue, la photo doit montrer le corps en entier.</p>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-md">
          <h2 className="font-display text-h2 font-semibold">Choisissez la coiffure</h2>
          <ul className="grid grid-cols-2 gap-md sm:grid-cols-3">
            {HAIRSTYLES.map((h) => (
              <li key={h.id}>
                <Tile selected={hairstyleId === h.id} disabled={busy} onClick={() => setHairstyleId(hairstyleId === h.id ? null : h.id)}>{h.name}</Tile>
              </li>
            ))}
          </ul>
          <p className="text-tiny text-ink-muted">Facultatif. Seuls vos cheveux changent.</p>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-md">
          <h2 className="font-display text-h2 font-semibold">Maquillage et accessoires</h2>
          <p className="text-caption font-semibold uppercase tracking-widest text-ink-muted">Maquillage</p>
          <ul className="grid grid-cols-2 gap-md sm:grid-cols-4">
            {MAKEUPS.map((m) => (
              <li key={m.id}>
                <Tile selected={makeupId === m.id} disabled={busy} onClick={() => setMakeupId(makeupId === m.id ? null : m.id)}>{m.name}</Tile>
              </li>
            ))}
          </ul>
          <p className="text-caption font-semibold uppercase tracking-widest text-ink-muted">Accessoires (jusqu'à {MAX_ACCESSORIES})</p>
          <ul className="grid grid-cols-2 gap-md sm:grid-cols-3">
            {ACCESSORIES.map((a) => (
              <li key={a.id}>
                <Tile selected={accessoryIds.includes(a.id)} disabled={busy || (!accessoryIds.includes(a.id) && accessoryIds.length >= MAX_ACCESSORIES)} onClick={() => toggleAccessory(a.id)}>{a.name}</Tile>
              </li>
            ))}
          </ul>
        </div>
      )}

      {last && (
        <div className="space-y-md">
          <h2 className="font-display text-h2 font-semibold">Votre photo</h2>
          <PhotoPicker file={file} onPick={setFile} disabled={busy} />
          <p className="text-tiny text-ink-muted">Une photo de face, le visage bien visible et bien éclairée. Le corps en entier si vous choisissez une tenue.</p>
          <Card className="space-y-sm">
            <p className="font-semibold">Récapitulatif</p>
            {breakdown.length === 0 ? (
              <p className="text-caption text-ink-muted">Choisissez au moins une étape (événement, tenue, coiffure, maquillage ou accessoires).</p>
            ) : (
              <ul className="space-y-xs text-body">
                {breakdown.map((b) => (
                  <li key={b.label} className="flex justify-between"><span>{b.label}</span><span className="text-ink-muted">{b.cost} crédits</span></li>
                ))}
                <li className="flex justify-between border-t border-line pt-xs font-semibold"><span>Total</span><span>{cost} crédits</span></li>
              </ul>
            )}
            <p className="text-tiny text-ink-muted">Un look complet peut prendre quelques minutes. Les crédits ne sont débités que si le résultat vous est livré.</p>
          </Card>
        </div>
      )}

      {lacking && (
        <Card className="flex items-center justify-between gap-md border-accent/40">
          <span className="text-body">Il vous faut {cost} crédits pour ce look.</span>
          <Link href="/credits" className="font-semibold text-accent-ink underline">Recharger</Link>
        </Card>
      )}
      <ErrorNote message={error} />
      {needCredits && <Link href="/credits" className="text-accent-ink underline">Acheter des crédits</Link>}

      <div className="flex gap-sm">
        {step > 0 && <Button variant="secondary" disabled={busy} onClick={() => setStep(step - 1)}>Retour</Button>}
        {!last ? (
          <Button className="flex-1" onClick={() => setStep(step + 1)}>Suivant</Button>
        ) : (
          <Button className="flex-1" onClick={start} loading={busy} disabled={!file || breakdown.length === 0 || lacking}>
            {phase === "uploading" ? "Envoi de la photo…" : phase === "creating" ? "Lancement…" : `Créer mon look · ${cost} crédits`}
          </Button>
        )}
      </div>
    </Screen>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LookPage />
    </Suspense>
  );
}

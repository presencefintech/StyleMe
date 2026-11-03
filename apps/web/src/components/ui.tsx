"use client";

import type { JobStatus, Operator } from "@styleme/shared";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { Icon } from "@/components/icons";
import { gradientCss } from "@/lib/style-palettes";

export const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

// --- Button -----------------------------------------------------------------------------------

type Variant = "primary" | "secondary" | "ghost";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-bg hover:bg-ink/85 active:translate-y-px",
  secondary: "border border-ink/70 bg-transparent text-ink hover:bg-bg-alt",
  ghost: "bg-transparent text-ink-muted hover:text-ink",
};

export function Button({
  variant = "primary",
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading}
      className={cx(
        "inline-flex min-h-12 items-center justify-center gap-sm rounded-sm px-xl text-body font-semibold transition duration-150",
        FOCUS,
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0",
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <span aria-hidden className="h-4 w-4 animate-spin rounded-pill border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

// --- Card / Screen ---------------------------------------------------------------------------------

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-xl border border-line bg-bg-surface p-lg shadow-card sm:p-xl", className)}>{children}</div>;
}

export function Screen({
  title,
  subtitle,
  eyebrow,
  compact = false,
  children,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  /** Titre réduit et sans sous-titre : pour les outils où le contenu (une photo) doit tenir à l'écran. */
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={cx("mx-auto w-full max-w-3xl px-lg", compact ? "pb-xl pt-lg" : "pb-3xl pt-2xl sm:pt-3xl")}>
      {eyebrow && !compact && <p className="mb-sm text-caption font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>}
      <h1 className={cx("font-display font-semibold text-ink", compact ? "text-h1" : "text-display sm:text-[3rem] sm:leading-[1.05]")}>{title}</h1>
      {subtitle && !compact && <p className="mt-md max-w-xl text-body text-ink-muted">{subtitle}</p>}
      <div className={cx("space-y-xl", compact ? "mt-lg space-y-md" : "mt-2xl")}>{children}</div>
    </section>
  );
}

// --- CreditBadge ----------------------------------------------------------------------------------------

export function CreditBadge({ value }: { value: number | undefined }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-sm border border-ink/70 px-md py-xs text-caption font-medium text-ink">
      {value === undefined ? "…" : `${value} crédit${value > 1 ? "s" : ""}`}
    </span>
  );
}

// --- JobStatusPill ------------------------------------------------------------------------------------------

const PILL: Record<JobStatus, { label: string; cls: string }> = {
  PENDING: { label: "En attente", cls: "bg-warning/15 text-warning" },
  PROCESSING: { label: "En cours", cls: "bg-primary/15 text-primary" },
  DONE: { label: "Terminé", cls: "bg-success/15 text-success" },
  REJECTED: { label: "Refusé", cls: "bg-danger/15 text-danger" },
  FAILED: { label: "Échec", cls: "bg-danger/15 text-danger" },
};
export function JobStatusPill({ status }: { status: JobStatus }) {
  const p = PILL[status];
  return <span className={cx("inline-flex rounded-sm px-md py-xs text-caption font-semibold", p.cls)}>{p.label}</span>;
}

// --- StyleCard : tuile d'occasion (aperçu du décor) ---------------------------------------------------------

export function StyleCard({
  id,
  name,
  creditCost,
  previewUrl,
  selected,
  onSelect,
}: {
  id: string;
  name: string;
  creditCost: number;
  previewUrl?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cx(
        "group relative aspect-[4/5] overflow-hidden rounded-lg border-2 text-left shadow-card transition duration-150",
        FOCUS,
        selected ? "border-primary ring-4 ring-primary/20" : "border-transparent hover:-translate-y-0.5",
      )}
    >
      {previewUrl ? (
        <img src={previewUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div aria-hidden className="absolute inset-0" style={{ backgroundImage: gradientCss(id) }}>
          {/* silhouette : montre où se place le sujet sur le décor */}
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
            <span className="h-9 w-9 rounded-pill bg-black/15" />
            <span className="mt-1 h-16 w-24 rounded-t-[2rem] bg-black/15" />
          </div>
        </div>
      )}
      <span className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/60 to-transparent p-md pt-2xl">
        <span className="text-body font-semibold text-white">{name}</span>
        <span className="text-caption text-white/80">{creditCost} cr.</span>
      </span>
      {selected && (
        <span aria-hidden className="absolute right-sm top-sm grid h-6 w-6 place-items-center rounded-sm bg-primary text-white"><Icon name="check" size={14} /></span>
      )}
    </button>
  );
}

// --- CreditPackCard ---------------------------------------------------------------------------------------------

export function CreditPackCard({
  credits,
  price,
  currency,
  selected,
  popular,
  onSelect,
}: {
  credits: number;
  price: number;
  currency: string;
  selected: boolean;
  popular?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cx(
        "relative rounded-lg border-2 bg-bg-surface p-lg text-left shadow-card transition duration-150",
        FOCUS,
        selected ? "border-primary ring-4 ring-primary/20" : "border-line hover:border-primary/40",
      )}
    >
      {popular && (
        <span className="absolute -top-3 left-lg rounded-sm bg-accent px-md py-0.5 text-tiny font-bold uppercase tracking-wide text-bg">Populaire</span>
      )}
      <div className="font-display text-display font-semibold text-ink">{credits}<span className="ml-xs text-caption font-sans font-medium text-ink-muted">crédits</span></div>
      <div className="mt-xs text-body font-semibold text-ink">{price} {currency}</div>
      <div className="text-caption text-ink-muted">{(price / credits).toFixed(2)} {currency} / crédit</div>
    </button>
  );
}

// --- OperatorSelector ------------------------------------------------------------------------------------------------

const OPERATOR_LABEL: Record<Operator, string> = { mpesa: "M-Pesa", orange: "Orange Money", airtel: "Airtel Money" };

export function OperatorSelector({ value, onChange }: { value: Operator; onChange: (o: Operator) => void }) {
  return (
    <div role="radiogroup" aria-label="Opérateur Mobile Money" className="grid grid-cols-3 gap-sm">
      {(Object.keys(OPERATOR_LABEL) as Operator[]).map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          onClick={() => onChange(o)}
          className={cx(
            "min-h-12 rounded-md border-2 px-sm text-caption font-semibold transition",
            FOCUS,
            value === o ? "border-primary bg-primary/10 text-ink" : "border-line bg-bg-surface text-ink-muted hover:text-ink",
          )}
        >
          {OPERATOR_LABEL[o]}
        </button>
      ))}
    </div>
  );
}

// --- Field / textarea ------------------------------------------------------------------------------------------------------

export const INPUT_CLASS =
  "w-full rounded-md border border-line bg-bg-surface px-md text-body text-ink placeholder:text-ink-muted/60 transition focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15";

export function Field({ label, hint, ...input }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = input.id ?? `f-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <label htmlFor={id} className="block">
      <span className="mb-xs block text-caption font-semibold text-ink">{label}</span>
      <input id={id} {...input} className={cx(INPUT_CLASS, "min-h-12")} />
      {hint && <span className="mt-xs block text-tiny text-ink-muted">{hint}</span>}
    </label>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-md py-sm text-caption text-danger">
      {message}
    </p>
  );
}

/** Suggestion cliquable (puces d'exemples d'instructions). */
export function Chip({ children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "rounded-sm border border-line bg-bg-surface px-md py-xs text-caption text-ink-muted transition hover:border-primary/50 hover:text-ink disabled:opacity-50",
        FOCUS,
      )}
    >
      {children}
    </button>
  );
}

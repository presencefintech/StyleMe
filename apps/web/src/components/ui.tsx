"use client";

import type { JobStatus, Operator } from "@styleme/shared";
import type { ButtonHTMLAttributes, ReactNode } from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

// --- Button ---------------------------------------------------------------------------

type Variant = "primary" | "secondary" | "ghost";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-signature text-ink shadow-card hover:brightness-110 active:bg-primary-dark",
  secondary: "bg-bg-alt text-ink border border-line hover:bg-bg-surface",
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
        "inline-flex min-h-11 items-center justify-center gap-sm rounded-md px-lg text-body font-semibold transition",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <span aria-hidden className="h-4 w-4 animate-spin rounded-pill border-2 border-ink border-t-transparent" />}
      {children}
    </button>
  );
}

// --- Card / Screen -------------------------------------------------------------------------

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-lg border border-line bg-bg-surface p-lg shadow-card", className)}>{children}</div>;
}

export function Screen({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-3xl px-lg py-xl">
      <h1 className="text-display font-bold text-ink">{title}</h1>
      {subtitle && <p className="mt-xs text-body text-ink-muted">{subtitle}</p>}
      <div className="mt-xl space-y-lg">{children}</div>
    </section>
  );
}

// --- CreditBadge --------------------------------------------------------------------------------

export function CreditBadge({ value }: { value: number | undefined }) {
  return (
    <span className="inline-flex items-center gap-xs rounded-pill border border-accent/40 bg-accent/10 px-md py-xs text-caption font-semibold text-accent">
      <span aria-hidden>✦</span>
      {value === undefined ? "…" : `${value} crédit${value > 1 ? "s" : ""}`}
    </span>
  );
}

// --- JobStatusPill -------------------------------------------------------------------------------

const PILL: Record<JobStatus, { label: string; cls: string }> = {
  PENDING: { label: "En attente", cls: "bg-warning/15 text-warning" },
  PROCESSING: { label: "En cours", cls: "bg-primary/20 text-ink" },
  DONE: { label: "Terminé", cls: "bg-success/15 text-success" },
  REJECTED: { label: "Refusé", cls: "bg-danger/15 text-danger" },
  FAILED: { label: "Échec", cls: "bg-danger/15 text-danger" },
};
export function JobStatusPill({ status }: { status: JobStatus }) {
  const p = PILL[status];
  return <span className={cx("inline-flex rounded-pill px-md py-xs text-caption font-semibold", p.cls)}>{p.label}</span>;
}

// --- StyleCard ---------------------------------------------------------------------------------------

export function StyleCard({
  name,
  creditCost,
  previewUrl,
  selected,
  onSelect,
}: {
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
        "overflow-hidden rounded-lg border bg-bg-surface text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
        selected ? "border-primary ring-2 ring-primary" : "border-line hover:border-primary/60",
      )}
    >
      {previewUrl ? <img src={previewUrl} alt="" className="h-28 w-full object-cover" /> : <div className="h-28 w-full bg-signature opacity-70" />}
      <div className="flex items-center justify-between p-md">
        <span className="text-body font-semibold text-ink">{name}</span>
        <span className="text-caption text-accent">{creditCost} ✦</span>
      </div>
    </button>
  );
}

// --- CreditPackCard --------------------------------------------------------------------------------------

export function CreditPackCard({
  credits,
  price,
  currency,
  selected,
  onSelect,
}: {
  credits: number;
  price: number;
  currency: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cx(
        "rounded-lg border bg-bg-surface p-lg text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
        selected ? "border-accent ring-2 ring-accent" : "border-line hover:border-accent/60",
      )}
    >
      <div className="text-h1 font-bold text-accent">{credits} ✦</div>
      <div className="mt-xs text-body text-ink-muted">
        {price} {currency}
      </div>
    </button>
  );
}

// --- OperatorSelector ---------------------------------------------------------------------------------------

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
            "min-h-11 rounded-md border px-sm text-caption font-semibold transition",
            value === o ? "border-primary bg-primary/20 text-ink" : "border-line bg-bg-alt text-ink-muted hover:text-ink",
          )}
        >
          {OPERATOR_LABEL[o]}
        </button>
      ))}
    </div>
  );
}

// --- Field ------------------------------------------------------------------------------------------------------

export function Field({ label, hint, ...input }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = input.id ?? `f-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <label htmlFor={id} className="block">
      <span className="mb-xs block text-caption font-medium text-ink-muted">{label}</span>
      <input
        id={id}
        {...input}
        className="min-h-11 w-full rounded-md border border-line bg-bg-alt px-md text-body text-ink placeholder:text-ink-muted/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      {hint && <span className="mt-xs block text-tiny text-ink-muted">{hint}</span>}
    </label>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-md py-sm text-caption text-danger">
      {message}
    </p>
  );
}

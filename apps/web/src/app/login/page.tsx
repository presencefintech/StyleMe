"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { REFERRAL } from "@styleme/shared";
import { Logo } from "@/components/logo";
import { Button, Card, ErrorNote, Field } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { gradientCss } from "@/lib/style-palettes";
import { useApi, useAuth } from "@/lib/providers";

const BENEFITS = [
  { glyph: "✦", title: "Le bon décor pour chaque occasion", text: "Mariage, diplôme, anniversaire… votre portrait est détouré et placé dans un décor soigné." },
  { glyph: "✎", title: "Retouchez avec une simple phrase", text: "« Enlève l'objet au fond », « change ma chemise en noir » : vous décrivez, l'IA retouche." },
  { glyph: "◈", title: "Vos photos restent privées", text: "Stockage privé, accès par liens temporaires. Vous n'êtes débité que si le résultat est livré." },
];

export default function LoginPage() {
  const api = useApi();
  const auth = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lien de parrainage : /login?ref=CODE
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) setReferralCode(ref.trim().toUpperCase());
  }, []);

  useEffect(() => {
    if (auth.ready && auth.session) router.replace("/enhance");
  }, [auth.ready, auth.session, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { accessToken, user } = mode === "login" ? await api.login(email, password) : await api.register(email, password, referralCode.trim() || undefined);
      auth.signIn({ token: accessToken, user });
      router.replace("/enhance");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const isLogin = mode === "login";
  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* halos décoratifs */}
      <div aria-hidden className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-pill bg-primary/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-pill bg-coral/20 blur-3xl" />

      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-3xl px-lg py-2xl lg:grid-cols-[1.1fr_0.9fr]">
        <section>
          <Logo />
          <h1 className="mt-3xl font-display text-hero font-semibold text-ink">
            Chaque occasion mérite sa <em className="bg-signature bg-clip-text not-italic text-transparent">plus belle photo</em>.
          </h1>
          <p className="mt-lg max-w-lg text-h2 text-ink-muted">
            Envoyez un portrait. StyleMe le détoure, le place dans le décor de l'occasion, et vous laisse le retoucher en une phrase.
          </p>

          <ul className="mt-2xl space-y-lg">
            {BENEFITS.map((b) => (
              <li key={b.title} className="flex gap-md">
                <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary/10 text-h2 text-primary">{b.glyph}</span>
                <div>
                  <p className="font-semibold text-ink">{b.title}</p>
                  <p className="text-caption text-ink-muted">{b.text}</p>
                </div>
              </li>
            ))}
          </ul>

          <div aria-hidden className="mt-2xl hidden gap-sm sm:flex">
            {["mariage", "anniversaire", "diplome", "saint-valentin", "fetes"].map((id) => (
              <span key={id} className="h-14 w-14 rounded-md shadow-card" style={{ backgroundImage: gradientCss(id) }} />
            ))}
          </div>
        </section>

        <Card className="w-full max-w-md justify-self-center lg:justify-self-end">
          <h2 className="font-display text-h1 font-semibold">{isLogin ? "Content de vous revoir" : "Créez votre compte"}</h2>
          <p className="mt-xs text-caption text-ink-muted">{isLogin ? "Connectez-vous pour continuer." : `${REFERRAL.signupBonus} crédits offerts, en quelques secondes.`}</p>
          <form onSubmit={submit} className="mt-xl space-y-lg">
            <Field label="Email" type="email" autoComplete="email" placeholder="vous@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Field
              label="Mot de passe"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              minLength={isLogin ? undefined : 8}
              hint={isLogin ? undefined : "8 caractères minimum."}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {!isLogin && (
              <Field
                label="Code de parrainage (facultatif)"
                autoComplete="off"
                maxLength={32}
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
              />
            )}
            <ErrorNote message={error} />
            <Button type="submit" loading={busy} className="w-full">{isLogin ? "Se connecter" : "Créer mon compte"}</Button>
            {!isLogin && (
              <p className="text-center text-tiny text-ink-muted">
                En créant un compte, vous acceptez les{" "}
                <Link href="/legal/terms" className="font-semibold text-primary underline-offset-2 hover:underline">conditions d'utilisation</Link> et la{" "}
                <Link href="/legal/privacy" className="font-semibold text-primary underline-offset-2 hover:underline">politique de confidentialité</Link>.
              </p>
            )}
          </form>
          <p className="mt-lg text-center text-caption text-ink-muted">
            {isLogin ? "Pas encore de compte ?" : "Déjà un compte ?"}{" "}
            <button type="button" onClick={() => { setMode(isLogin ? "register" : "login"); setError(null); }} className="font-semibold text-primary underline-offset-2 hover:underline">
              {isLogin ? "Créer un compte" : "Se connecter"}
            </button>
          </p>
        </Card>
      </div>
    </main>
  );
}

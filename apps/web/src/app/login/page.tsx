"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button, Card, ErrorNote, Field, Screen } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { useApi, useAuth } from "@/lib/providers";

export default function LoginPage() {
  const api = useApi();
  const auth = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.ready && auth.session) router.replace("/enhance");
  }, [auth.ready, auth.session, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { accessToken, user } = mode === "login" ? await api.login(email, password) : await api.register(email, password);
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
    <main className="min-h-screen bg-bg">
      <Screen title="StyleMe" subtitle={isLogin ? "Connectez-vous pour continuer." : "Créez votre compte en quelques secondes."}>
        <Card>
          <form onSubmit={submit} className="space-y-lg">
            <Field
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="vous@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
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
            <ErrorNote message={error} />
            <Button type="submit" loading={busy} className="w-full">
              {isLogin ? "Se connecter" : "Créer mon compte"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => { setMode(isLogin ? "register" : "login"); setError(null); }}
            >
              {isLogin ? "Pas encore de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
            </Button>
          </form>
        </Card>
      </Screen>
    </main>
  );
}

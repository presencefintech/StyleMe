"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";

const DISMISS_KEY = "styleme:install-dismissed";

/** Enregistre le service worker (production uniquement : en dev il gênerait le rechargement à chaud). */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => { /* non bloquant : l'app fonctionne sans */ });
  }, []);
  return null;
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
function isDismissed(): boolean {
  try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
}

/** Invite à installer l'app : bouton natif sur Android/Chrome, mode d'emploi sur iPhone (pas d'API d'installation). */
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (isStandalone() || isDismissed()) return;
    setHidden(false);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (e: Event) => { e.preventDefault(); setEvent(e as InstallEvent); };
    const onInstalled = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden || (!event && !ios)) return null;

  function dismiss() {
    setHidden(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* indisponible */ }
  }
  async function install() {
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    setEvent(null);
    if (outcome === "accepted") setHidden(true);
  }

  return (
    <div className="mx-auto max-w-5xl px-lg pt-md">
      <Card className="flex flex-wrap items-center justify-between gap-md">
        <div className="min-w-0">
          <p className="font-semibold">Installez StyleMe sur votre téléphone</p>
          <p className="text-caption text-ink-muted">
            {event ? "Accès direct depuis l'écran d'accueil, en plein écran." : "Appuyez sur Partager, puis « Sur l'écran d'accueil »."}
          </p>
        </div>
        <div className="flex gap-sm">
          {event && <Button onClick={install}>Installer</Button>}
          <Button variant="ghost" onClick={dismiss}>Plus tard</Button>
        </div>
      </Card>
    </div>
  );
}

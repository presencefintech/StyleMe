import * as Sentry from "@sentry/node";

let enabled = false;

/** Sans SENTRY_DSN, tout est inactif (dev, tests). Aucune donnée personnelle n'est envoyée (pas de corps de requête, pas d'IP). */
export function initSentry(dsn: string | undefined, environment: string): boolean {
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment,
    // Confidentialité maximale : ni utilisateur, ni cookies, ni en-têtes (jeton JWT), ni corps de requête, ni variables locales.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    tracesSampleRate: 0,
    // Les messages d'erreur peuvent citer un email ou un chemin "<userId>/..." : on ne garde que le type et la pile.
    beforeSend(event) {
      delete event.request;
      delete event.user;
      return event;
    },
  });
  enabled = true;
  return true;
}

/** Signale une erreur inattendue. `context` : identifiants techniques uniquement (jobId, ...), jamais de contenu utilisateur. */
export function reportError(error: unknown, context: Record<string, string> = {}): void {
  if (!enabled) return;
  Sentry.captureException(error, { extra: context });
}

/** Laisse à Sentry le temps d'envoyer ce qui est en attente avant l'arrêt du processus. */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (enabled) await Sentry.flush(timeoutMs);
}

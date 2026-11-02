"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createApi, type Api, type UserView } from "./api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";
const STORAGE_KEY = "styleme.session";

interface Session { token: string; user: UserView }
interface AuthState {
  ready: boolean;
  session: Session | null;
  signIn: (s: Session) => void;
  signOut: () => void;
  markAgeConfirmed: () => void;
}

const AuthContext = createContext<AuthState | null>(null);
const ApiContext = createContext<Api | null>(null);

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
function writeSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* stockage indisponible (navigation privée) : la session reste en mémoire */
  }
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = session?.token ?? null;

  useEffect(() => {
    setSession(readSession());
    setReady(true);
  }, []);

  const signOut = useCallback(() => {
    writeSession(null);
    setSession(null);
    queryClient.clear();
  }, [queryClient]);

  const api = useMemo(
    () => createApi({ baseUrl: API_URL, getToken: () => tokenRef.current, onUnauthorized: signOut }),
    [signOut],
  );

  const auth = useMemo<AuthState>(
    () => ({
      ready,
      session,
      signIn: (s) => { writeSession(s); setSession(s); },
      signOut,
      markAgeConfirmed: () =>
        setSession((cur) => {
          if (!cur) return cur;
          const next = { ...cur, user: { ...cur.user, ageConfirmed: true } };
          writeSession(next);
          return next;
        }),
    }),
    [ready, session, signOut],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ApiContext.Provider value={api}>
        <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
      </ApiContext.Provider>
    </QueryClientProvider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth must be used inside <Providers>");
  return v;
}
export function useApi(): Api {
  const v = useContext(ApiContext);
  if (!v) throw new Error("useApi must be used inside <Providers>");
  return v;
}

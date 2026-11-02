"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/providers";

const TERMINAL = ["DONE", "REJECTED", "FAILED"];

export const keys = {
  balance: ["balance"] as const,
  styles: ["styles"] as const,
  packs: ["packs"] as const,
  job: (id: string) => ["job", id] as const,
  jobs: ["jobs"] as const,
  payment: (id: string) => ["payment", id] as const,
};

export function useBalance() {
  const api = useApi();
  return useQuery({ queryKey: keys.balance, queryFn: () => api.balance() });
}
export function useStyles() {
  const api = useApi();
  return useQuery({ queryKey: keys.styles, queryFn: () => api.styles(), staleTime: 5 * 60_000 });
}
export function usePacks() {
  const api = useApi();
  return useQuery({ queryKey: keys.packs, queryFn: () => api.packs(), staleTime: 5 * 60_000 });
}

/** Suit le statut d'un job : poll toutes les 2 s jusqu'à un état terminal. */
export function useJob(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: keys.job(id),
    queryFn: () => api.getJob(id),
    refetchInterval: (q) => (q.state.data && TERMINAL.includes(q.state.data.status) ? false : 2000),
  });
}

export function useJobHistory() {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: keys.jobs,
    queryFn: ({ pageParam }) => api.listJobs(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Suit un paiement Mobile Money : poll jusqu'à SUCCEEDED/FAILED. */
export function usePayment(id: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: keys.payment(id ?? "none"),
    queryFn: () => api.getPayment(id!),
    enabled: id !== null,
    refetchInterval: (q) => (q.state.data && q.state.data.status !== "PENDING" ? false : 3000),
  });
}

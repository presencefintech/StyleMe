"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/providers";

export default function Home() {
  const { ready, session } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (ready) router.replace(session ? "/enhance" : "/login");
  }, [ready, session, router]);
  return null;
}

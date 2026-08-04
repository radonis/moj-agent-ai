"use client";

import { usePathname, useRouter } from "next/navigation";
import { PropsWithChildren, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function AuthGuard({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublicPage = pathname === "/" || pathname === "/login";
  const [ready, setReady] = useState(isPublicPage);

  useEffect(() => {
    if (pathname === "/" || pathname === "/login") {
      setReady(true);
      return;
    }

    if (!supabase) {
      router.replace("/login");
      return;
    }

    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      if (!data.user) {
        router.replace("/login");
        return;
      }
      setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [pathname, router]);

  if (!ready && !isPublicPage) {
    return <main className="page"><p>Sprawdzam logowanie...</p></main>;
  }

  return <>{children}</>;
}

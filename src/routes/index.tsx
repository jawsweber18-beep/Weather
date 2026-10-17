import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { QuorumApp } from "@/components/weather/QuorumApp";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { syncPrefsFromAccount } from "@/lib/weather/prefs";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();
  const [synced, setSynced] = useState(false);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    syncPrefsFromAccount()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setSynced(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (isPending) return null;
  if (!user) return <RedirectToSignIn />;
  if (!synced) return null;
  return <QuorumApp />;
}

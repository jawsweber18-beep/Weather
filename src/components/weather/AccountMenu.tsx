import { useState } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "@/lib/auth/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { clearLocalPrefs } from "@/lib/weather/prefs";

export function AccountMenu() {
  const user = useCurrentUser();
  const [busy, setBusy] = useState(false);
  if (!user || user.isDevFallback) return null;
  const label = user.displayName || user.primaryEmail || "Account";

  return (
    <button
      type="button"
      className="flex size-11 items-center justify-center rounded-full bg-surface text-ink shadow-card disabled:cursor-wait"
      aria-label={`Sign out ${label}`}
      title={`Signed in as ${label} — sign out`}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        clearLocalPrefs();
        void signOut().catch(() => setBusy(false));
      }}
    >
      <LogOut className="size-4" />
    </button>
  );
}

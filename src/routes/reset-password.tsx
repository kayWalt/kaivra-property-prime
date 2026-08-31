import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brand } from "@/components/kaivra/Brand";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "KAIVRA | Set a New Password" },
      {
        name: "description",
        content:
          "Choose a new password for your KAIVRA investor account and regain secure access to your investments.",
      },
      { property: "og:title", content: "KAIVRA | Set a New Password" },
      {
        property: "og:description",
        content: "Securely reset the password for your KAIVRA investor account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPasswordPage,
});

const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(72);

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setValid(true);
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setValid(Boolean(data.session));
      setReady(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please choose a stronger password.");
      return;
    }
    if (password !== confirm) {
      toast.error("The two passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast.success("Your password has been updated.");
      void navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update your password. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm kv-rise">
        <Brand withTagline />
        <h1 className="mt-10 font-display text-3xl">Set a new password</h1>

        {!ready ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Verifying your reset link…
          </p>
        ) : !valid ? (
          <div className="mt-4 space-y-6">
            <p className="text-sm text-muted-foreground">
              This password reset link is invalid or has expired. Request a new link from the
              sign-in page.
            </p>
            <Button className="h-12 w-full" onClick={() => navigate({ to: "/auth" })}>
              Back to sign in
            </Button>
          </div>
        ) : done ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Password updated. Redirecting to your dashboard…
          </p>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={show ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="h-12 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide password" : "Show password"}
                  aria-pressed={show}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground"
                >
                  {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type={show ? "text" : "password"}
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="h-12"
              />
            </div>
            <Button type="submit" className="h-12 w-full" disabled={busy}>
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Update password
            </Button>
          </form>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          <Link to="/" className="underline-offset-4 hover:underline">
            Return to KAIVRA
          </Link>
        </p>
      </div>
    </div>
  );
}

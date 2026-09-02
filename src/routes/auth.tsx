import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { createLovableAuth } from "@lovable.dev/cloud-auth-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brand } from "@/components/kaivra/Brand";
import { useSession } from "@/hooks/useAuth";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { assetUrl } from "@/lib/media";
import authHero from "@/assets/kaivra-duplex-option-1.jpg.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "KAIVRA | Sign In or Create Your Investor Account" },
      {
        name: "description",
        content:
          "Access your KAIVRA investor account to manage real-estate investments, subscriptions and payments in one secure platform.",
      },
      { property: "og:title", content: "KAIVRA | Investor Access" },
      {
        property: "og:description",
        content: "Sign in to manage your real-estate investments with KAIVRA.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://kaivraa.com/auth" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://kaivraa.com/auth" }],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  fullName: z.string().trim().max(120).optional(),
});

const googleAuth = createLovableAuth({
  oauthBrokerUrl: "https://kaivraa-com.lovable.app/~oauth/initiate",
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [action, setAction] = useState<null | "submit" | "google">(null);
  const busy = action !== null;
  const [checkEmail, setCheckEmail] = useState(false);
  const { session } = useSession();

  useEffect(() => {
    if (session) navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "forgot") {
      const parsedEmail = z.string().trim().email("Enter a valid email address").safeParse(email);
      if (!parsedEmail.success) {
        toast.error(parsedEmail.error.issues[0]?.message ?? "Enter a valid email address");
        return;
      }
      setAction("submit");
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(parsedEmail.data, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setResetSent(true);
      } catch (err) {
        const raw = err instanceof Error ? err.message : "";
        toast.error(
          /rate|too many|seconds/i.test(raw)
            ? "Too many attempts. Please wait a moment and try again."
            : /smtp|sending|email|configur/i.test(raw)
              ? "Reset emails are not available right now. Please contact KAIVRA support."
              : "Could not send the reset link. Please try again.",
        );
      } finally {
        setAction(null);
      }
      return;
    }
    const parsed = schema.safeParse({ email, password, fullName });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check your details.");
      return;
    }
    setAction("submit");
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: parsed.data.fullName || null },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setCheckEmail(true);
          return;
        }
        navigate({ to: "/dashboard", replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      const message = /weak|pwned/i.test(raw)
        ? "That password has appeared in known data breaches. Please choose a stronger, unique password."
        : /already registered|user already/i.test(raw)
          ? "An account with this email already exists. Try signing in instead."
          : raw;
      toast.error(message);
    } finally {
      setAction(null);
    }
  }

  async function google() {
    if (busy) return;
    setAction("google");
    try {
      const result = await googleAuth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/auth`,
      });
      if (result.error) {
        setAction(null);
        toast.error("Google sign-in could not be completed. Please try again.");
        return;
      }
      if (result.redirected) return; // browser is navigating away; keep the spinner
      await supabase.auth.setSession(result.tokens);
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      setAction(null);
      toast.error(err instanceof Error ? err.message : "Google sign-in could not be started.");
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden lg:block">
        <img
          src={assetUrl(authHero.url)}
          alt="Proposed five bedroom KAIVRA duplex, option one architectural renders"
          className="absolute inset-0 size-full object-cover"
          width={1920}
          height={1088}
          decoding="async"
          fetchPriority="low"
        />
        <div className="hero-scrim absolute inset-0" />
        <div className="absolute bottom-12 left-12 right-12">
          <div className="rule-gold mb-6" />
          <h2 className="font-display text-4xl text-onyx-foreground">
            Invest in the future you can own.
          </h2>
          <p className="mt-3 max-w-md text-sm text-onyx-foreground/75">
            Securely manage your real-estate investments, subscriptions and payments in one simple
            platform.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm kv-rise">
          <Brand withTagline />
          {checkEmail ? (
            <div className="mt-10 rounded-lg border border-border bg-card p-6">
              <h1 className="font-display text-2xl">Check your email</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                We sent a confirmation link to {email}. Confirm your address to activate your
                investor account.
              </p>
              <Button
                variant="outline"
                className="mt-6 w-full"
                onClick={() => setCheckEmail(false)}
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <>
              <h1 className="mt-10 font-display text-3xl">
                {mode === "signin"
                  ? "Welcome back"
                  : mode === "signup"
                    ? "Create your account"
                    : "Reset your password"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {mode === "signin"
                  ? "Access your investments and applications."
                  : mode === "signup"
                    ? "Start your investment application in minutes."
                    : "Enter your email and we will send you a secure link to set a new password."}
              </p>

              <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
                {mode === "signup" ? (
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full name</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      autoComplete="name"
                      className="h-12"
                    />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="h-12"
                  />
                </div>
                {mode !== "forgot" ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      {mode === "signin" ? (
                        <button
                          type="button"
                          className="text-xs font-semibold text-primary underline-offset-4 hover:underline"
                          onClick={() => {
                            setResetSent(false);
                            setMode("forgot");
                          }}
                        >
                          Forgot password?
                        </button>
                      ) : null}
                    </div>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete={mode === "signin" ? "current-password" : "new-password"}
                        className="h-12 pr-12"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                      </button>
                    </div>
                  </div>
                ) : null}
                {mode === "forgot" && resetSent ? (
                  <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                    If an account exists for {email}, a password reset link is on its way. Check
                    your inbox and spam folder.
                  </p>
                ) : null}
                <Button type="submit" className="h-12 w-full" disabled={busy}>
                  {action === "submit" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  {action === "submit"
                    ? mode === "signin"
                      ? "Signing in\u2026"
                      : mode === "signup"
                        ? "Creating account\u2026"
                        : "Sending reset link\u2026"
                    : mode === "signin"
                      ? "Sign in"
                      : mode === "signup"
                        ? "Create account"
                        : "Send reset link"}
                </Button>
                {mode === "forgot" ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 w-full"
                    onClick={() => {
                      setResetSent(false);
                      setMode("signin");
                    }}
                  >
                    Back to sign in
                  </Button>
                ) : null}
              </form>

              {mode !== "forgot" ? (
                <>
                  <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="h-px flex-1 bg-border" /> OR{" "}
                    <span className="h-px flex-1 bg-border" />
                  </div>

                  <Button
                    variant="outline"
                    className="h-12 w-full"
                    onClick={google}
                    disabled={busy}
                  >
                    {action === "google" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    {action === "google" ? "Connecting to Google\u2026" : "Continue with Google"}
                  </Button>

                  <p className="mt-6 text-center text-sm text-muted-foreground">
                    {mode === "signin" ? "New to KAIVRA?" : "Already have an account?"}{" "}
                    <button
                      type="button"
                      className="font-semibold text-primary underline-offset-4 hover:underline"
                      onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                    >
                      {mode === "signin" ? "Create an account" : "Sign in"}
                    </button>
                  </p>
                </>
              ) : null}
              <p className="mt-8 text-center text-xs text-muted-foreground">
                <Link to="/" className="underline-offset-4 hover:underline">
                  Return to KAIVRA
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

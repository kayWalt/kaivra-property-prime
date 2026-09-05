import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, MailX } from "lucide-react";
import { unsubscribeFromMarketing } from "@/lib/email.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * One-click unsubscribe from KAIVRA property updates.
 * Only marketing email is affected — service messages about an investor's own
 * application and payments are always delivered.
 */
export const Route = createFileRoute("/unsubscribe")({
  head: () => ({
    meta: [
      { title: "Unsubscribe from KAIVRA property updates" },
      {
        name: "description",
        content:
          "Stop receiving KAIVRA property update emails. Service messages about your application and payments continue.",
      },
      { property: "og:title", content: "Unsubscribe from KAIVRA property updates" },
      {
        property: "og:description",
        content: "Manage the KAIVRA property update emails you receive.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const [state, setState] = useState<"working" | "done" | "invalid">("working");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    if (!token) {
      setState("invalid");
      return;
    }
    unsubscribeFromMarketing({ data: { token } })
      .then((res) => setState(res.ok ? "done" : "invalid"))
      .catch(() => setState("invalid"));
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {state === "done" ? (
              <CheckCircle2 className="size-5 text-primary" aria-hidden />
            ) : (
              <MailX className="size-5 text-muted-foreground" aria-hidden />
            )}
            {state === "working"
              ? "Updating your preferences…"
              : state === "done"
                ? "You have been unsubscribed"
                : "This unsubscribe link is not valid"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            {state === "done"
              ? "You will no longer receive KAIVRA property updates and promotions. Important messages about your own application and payments will still reach you."
              : state === "invalid"
                ? "The link may have expired or already been used. You can change your email preferences from your KAIVRA profile at any time."
                : "One moment please."}
          </p>
          <Button asChild variant="outline">
            <Link to="/">Back to KAIVRA</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

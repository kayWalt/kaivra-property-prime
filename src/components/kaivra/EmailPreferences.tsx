import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getMyEmailPreferences, setMyEmailPreferences } from "@/lib/email.functions";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type PrefKey =
  | "marketing_opt_in"
  | "promotions_opt_in"
  | "new_property_opt_in"
  | "campaigns_opt_in";

const OPTIONS: { key: PrefKey; title: string; body: string }[] = [
  {
    key: "promotions_opt_in",
    title: "Promotions and special offers",
    body: "Limited-time offers and payment plan promotions from KAIVRA.",
  },
  {
    key: "new_property_opt_in",
    title: "New properties and price updates",
    body: "New listings published by KAIVRA and genuine price changes.",
  },
  {
    key: "campaigns_opt_in",
    title: "KAIVRA announcements",
    body: "Company news and general announcements.",
  },
];

/**
 * Investor-facing email preferences.
 *
 * Only optional marketing categories can be switched off. Service messages
 * about the investor's own application, payments and documents are mandatory
 * and are deliberately not switchable.
 */
export function EmailPreferences() {
  const load = useServerFn(getMyEmailPreferences);
  const save = useServerFn(setMyEmailPreferences);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["email-preferences"],
    queryFn: () => load({ data: undefined as never }),
  });

  async function toggle(key: PrefKey, value: boolean) {
    try {
      const next = await save({ data: { [key]: value } as Record<PrefKey, boolean> });
      qc.setQueryData(["email-preferences"], next);
      toast.success("Your email preferences have been updated.");
    } catch {
      toast.error("Your preference could not be saved. Please try again.");
    }
  }

  const master = data?.marketing_opt_in ?? true;

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-5">
      <h2 className="text-base font-semibold">Email notifications</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Updates about your own application, payments and documents are always sent — they are part
        of the service.
      </p>

      <div className="mt-4 flex items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <Label htmlFor="marketing-opt-in" className="text-sm font-medium">
            Optional KAIVRA emails
          </Label>
          <p className="text-sm text-muted-foreground">
            Turn this off to stop all promotional email at once.
          </p>
        </div>
        <Switch
          id="marketing-opt-in"
          disabled={isLoading}
          checked={master}
          onCheckedChange={(v) => void toggle("marketing_opt_in", v)}
        />
      </div>

      <div className="mt-4 space-y-4">
        {OPTIONS.map((option) => (
          <div key={option.key} className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor={option.key} className="text-sm font-medium">
                {option.title}
              </Label>
              <p className="text-sm text-muted-foreground">{option.body}</p>
            </div>
            <Switch
              id={option.key}
              disabled={isLoading || !master}
              checked={master && (data?.[option.key] ?? true)}
              onCheckedChange={(v) => void toggle(option.key, v)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

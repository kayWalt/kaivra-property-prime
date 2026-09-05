import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getMyEmailPreferences, setMyEmailPreferences } from "@/lib/email.functions";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

/**
 * Investor-facing email preferences.
 *
 * Only optional property updates and promotions can be switched off. Service
 * messages about the investor's own application and payments are mandatory and
 * are deliberately not switchable.
 */
export function EmailPreferences() {
  const load = useServerFn(getMyEmailPreferences);
  const save = useServerFn(setMyEmailPreferences);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["email-preferences"],
    queryFn: () => load({ data: undefined as never }),
  });

  async function toggle(value: boolean) {
    try {
      await save({ data: { marketing_opt_in: value } });
      qc.setQueryData(["email-preferences"], { marketing_opt_in: value });
      toast.success(
        value
          ? "You will receive KAIVRA property updates."
          : "You will no longer receive property updates.",
      );
    } catch {
      toast.error("Your preference could not be saved. Please try again.");
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-5">
      <h2 className="text-base font-semibold">Email notifications</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Updates about your own application, payments and documents are always sent — they are part
        of the service.
      </p>
      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <Label htmlFor="marketing-opt-in" className="text-sm font-medium">
            Property updates and promotions
          </Label>
          <p className="text-sm text-muted-foreground">
            New listings, price changes and KAIVRA announcements.
          </p>
        </div>
        <Switch
          id="marketing-opt-in"
          disabled={isLoading}
          checked={data?.marketing_opt_in ?? true}
          onCheckedChange={(v) => void toggle(v)}
        />
      </div>
    </section>
  );
}

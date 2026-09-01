import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AsyncButton } from "@/components/kaivra/AsyncButton";
import { StatusBadge } from "@/components/kaivra/StatusBadge";
import {
  createAssistedApplication,
  lookupInvestorForAssist,
  type AssistApplicationSummary,
  type InvestorSummary,
} from "@/lib/investors.functions";
import { formatDate, formatNaira, type ApplicationStatus } from "@/lib/kaivra";

interface Result {
  investor: InvestorSummary;
  applications: AssistApplicationSummary[];
  draftApplicationId: string | null;
  totals: { value: number; paid: number; outstanding: number };
}

/**
 * "Find / Assist Investor" — staff enter an existing KAIVRA Investor ID (or
 * name/email/phone) and continue that investor's own application. The lookup
 * runs only when the staff member submits it (no per-keystroke queries) and is
 * authorised server-side through RLS; the Investor ID never grants access.
 */
export function AssistInvestorDialog({
  open,
  onOpenChange,
  onView,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onView?: (term: string) => void;
}) {
  const [term, setTerm] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const lookup = useServerFn(lookupInvestorForAssist);
  const startAssisted = useServerFn(createAssistedApplication);
  const navigate = useNavigate();

  function reset() {
    setTerm("");
    setResult(null);
  }

  async function search() {
    const value = term.trim();
    if (value.length < 2) {
      toast.error("Enter the investor's KAIVRA Investor ID, name, email or phone.");
      return;
    }
    try {
      const res = await lookup({ data: { term: value } });
      setResult(res as unknown as Result);
    } catch (error) {
      setResult(null);
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to retrieve the investor right now. Please try again.",
      );
    }
  }

  async function open_(mode: "continue" | "new") {
    if (!result) return;
    try {
      const { applicationId } = await startAssisted({
        data: { investorId: result.investor.id, mode },
      });
      onOpenChange(false);
      reset();
      void navigate({ to: "/application", search: { id: applicationId } });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The application could not be opened.",
      );
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assist an investor</DialogTitle>
          <DialogDescription>
            The investor keeps their own account and password. Their Investor ID is only used to
            find their existing record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="assist-term">Investor ID (recommended)</Label>
          <div className="flex gap-2">
            <Input
              id="assist-term"
              value={term}
              placeholder="KVR-I-26-7P6B8R"
              autoComplete="off"
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void search();
              }}
            />
            <AsyncButton pendingLabel="Searching…" onClick={search}>
              <Search className="mr-2 size-4" aria-hidden />
              Find
            </AsyncButton>
          </div>
          <p className="text-xs text-muted-foreground">
            You can also search by full name, email address or phone number.
          </p>
        </div>

        {result ? (
          <div className="space-y-4 rounded-lg border border-border p-4">
            <div className="min-w-0">
              <p className="eyebrow text-muted-foreground">Investor</p>
              <p className="truncate font-display text-xl">
                {result.investor.full_name ?? "Unnamed investor"}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                {result.investor.investor_code ?? "—"}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {result.investor.email ?? "—"}
              </p>
              <p className="text-sm text-muted-foreground">{result.investor.phone ?? "—"}</p>
            </div>

            <dl className="grid grid-cols-3 gap-3 border-t border-border pt-3 text-sm">
              <div className="min-w-0">
                <dt className="text-xs uppercase tracking-widest text-muted-foreground">Value</dt>
                <dd className="font-semibold break-words">{formatNaira(result.totals.value)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs uppercase tracking-widest text-muted-foreground">Paid</dt>
                <dd className="font-semibold break-words">{formatNaira(result.totals.paid)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs uppercase tracking-widest text-muted-foreground">
                  Outstanding
                </dt>
                <dd className="font-semibold break-words">
                  {formatNaira(result.totals.outstanding)}
                </dd>
              </div>
            </dl>

            <ul className="space-y-2 border-t border-border pt-3 text-sm">
              {result.applications.length === 0 ? (
                <li className="text-muted-foreground">
                  This investor does not currently have an application.
                </li>
              ) : (
                result.applications.map((app) => (
                  <li key={app.id} className="flex min-w-0 items-center justify-between gap-3">
                    <span className="min-w-0 truncate">
                      {app.reference ?? "Draft"} · {app.project_name ?? "—"}
                      {app.property_name ? ` · ${app.property_name}` : ""}
                    </span>
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <StatusBadge status={app.status as ApplicationStatus} />
                      <span className="text-xs text-muted-foreground">
                        {formatDate(app.submitted_at ?? app.created_at)}
                      </span>
                    </span>
                  </li>
                ))
              )}
            </ul>

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <AsyncButton
                variant="ghost"
                size="sm"
                onClick={() => {
                  onView?.(result.investor.investor_code ?? result.investor.email ?? "");
                  onOpenChange(false);
                  reset();
                }}
              >
                View investor
              </AsyncButton>
              {result.draftApplicationId ? (
                <AsyncButton size="sm" pendingLabel="Opening…" onClick={() => open_("continue")}>
                  Continue existing application
                </AsyncButton>
              ) : null}
              <AsyncButton
                size="sm"
                variant={result.draftApplicationId ? "outline" : "default"}
                pendingLabel="Starting…"
                onClick={() => open_("new")}
              >
                Start new investment
              </AsyncButton>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

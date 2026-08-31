import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  findInvestorByReference,
  searchInvestors,
  type InvestorSummary,
} from "@/lib/investors.functions";

/**
 * Shared investor lookup used by every admin flow that needs to attach a record
 * to an investor identity. Searches KAIVRA Investor ID, name, email, phone and
 * application/payment reference through the existing profiles architecture.
 */
export function InvestorPicker({
  selected,
  onSelect,
}: {
  selected: InvestorSummary | null;
  onSelect: (investor: InvestorSummary) => void;
}) {
  const search = useServerFn(searchInvestors);
  const byReference = useServerFn(findInvestorByReference);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<InvestorSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const [direct, refs] = await Promise.all([
          search({ data: { term } }),
          term.trim() ? byReference({ data: { reference: term } }) : { investors: [] },
        ]);
        if (cancelled) return;
        const map = new Map<string, InvestorSummary>();
        [...direct.investors, ...refs.investors].forEach((i) => map.set(i.id, i));
        setResults([...map.values()]);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [term, search, byReference]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Investor ID, name, email, phone or reference"
          className="pl-9"
          aria-label="Search investors"
        />
      </div>

      <div className="max-h-64 overflow-y-auto rounded-md border border-border">
        {loading && results.length === 0 ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Searching…
          </p>
        ) : results.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No investor matches that search. Register the investor instead.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {results.map((investor) => (
              <li key={investor.id}>
                <button
                  type="button"
                  onClick={() => onSelect(investor)}
                  className={cn(
                    "w-full px-4 py-3 text-left transition-colors hover:bg-accent/50",
                    selected?.id === investor.id && "bg-accent/60",
                  )}
                >
                  <p className="font-medium">{investor.full_name ?? "Unnamed investor"}</p>
                  <p className="text-xs text-muted-foreground">
                    {investor.investor_code ?? "—"} · {investor.email ?? "—"}
                    {investor.phone ? ` · ${investor.phone}` : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {results.length > 1 && term.trim() ? (
        <p className="text-xs text-muted-foreground">
          Possible existing investors found — select the correct identity. Records are never merged
          automatically.
        </p>
      ) : null}
    </div>
  );
}

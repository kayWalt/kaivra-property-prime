import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CalendarDays, Check, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AsyncButton } from "@/components/kaivra/AsyncButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/kaivra/EmptyState";
import { StatusBadge } from "@/components/kaivra/StatusBadge";
import { useProfile, useSession } from "@/hooks/useAuth";
import { logEvent, notify, notifyStaffForProject } from "@/lib/applications";
import { formatDate, type ApplicationStatus } from "@/lib/kaivra";
import { INSPECTION_SLOTS, fetchTakenSlots, formatSlot, toDateKey } from "@/lib/inspections";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/inspections/new")({
  head: () => ({
    meta: [
      { title: "KAIVRA | Schedule an Inspection" },
      {
        name: "description",
        content: "Book a guided inspection of the property behind your KAIVRA investment.",
      },
      { property: "og:title", content: "KAIVRA | Schedule an Inspection" },
      { property: "og:description", content: "Choose a date and time to inspect your property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ScheduleInspection,
});

type AppRow = {
  id: string;
  reference: string | null;
  status: ApplicationStatus;
  project_id: string | null;
  property_id: string | null;
  investment: { units?: number } | null;
  projects: { name: string; location: string } | null;
  properties: { name: string; property_type: string; size_label: string } | null;
};

const STEPS = ["Investment", "Date", "Time", "Details", "Confirm"];

function ScheduleInspection() {
  const { user } = useSession();
  const { data: profile } = useProfile(user?.id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [appId, setAppId] = useState<string | null>(null);
  const [date, setDate] = useState<Date | undefined>();
  const [slot, setSlot] = useState<string | null>(null);
  const [attendees, setAttendees] = useState("1");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [touchedContact, setTouchedContact] = useState(false);

  const apps = useQuery({
    queryKey: ["inspection-eligible-apps", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select(
          "id, reference, status, project_id, property_id, investment, projects(name, location), properties(name, property_type, size_label)",
        )
        .eq("investor_id", user!.id)
        .not("project_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data ?? []) as unknown as AppRow[];
    },
  });

  const selected = useMemo(
    () => apps.data?.find((a) => a.id === appId) ?? null,
    [apps.data, appId],
  );
  const dateKey = date ? toDateKey(date) : null;

  const taken = useQuery({
    queryKey: ["inspection-slots", selected?.project_id, dateKey],
    enabled: !!selected?.project_id && !!dateKey,
    staleTime: 15_000,
    queryFn: () => fetchTakenSlots(selected!.project_id!, dateKey!),
  });

  const contactPhone = touchedContact ? phone : phone || profile?.phone || "";
  const contactEmail = touchedContact ? email : email || profile?.email || user?.email || "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const canContinue =
    (step === 0 && !!selected) ||
    (step === 1 && !!date) ||
    (step === 2 && !!slot) ||
    (step === 3 && contactPhone.trim().length > 5 && contactEmail.includes("@"));

  async function submit() {
    if (!user || !selected || !dateKey || !slot) return;
    const { data, error } = await supabase
      .from("inspection_appointments")
      .insert({
        investor_id: user.id,
        created_by: user.id,
        application_id: selected.id,
        project_id: selected.project_id,
        property_id: selected.property_id,
        scheduled_date: dateKey,
        scheduled_time: `${slot}:00`,
        attendee_count: Math.max(1, Number(attendees) || 1),
        phone: contactPhone.trim(),
        email: contactEmail.trim(),
        notes: notes.trim() || null,
      })
      .select("id, reference")
      .single();

    if (error) {
      toast.error(
        error.code === "23505"
          ? "That time slot has just been taken. Please choose another."
          : "The inspection could not be scheduled. Please try again.",
      );
      await taken.refetch();
      return;
    }

    const when = `${formatDate(dateKey)} at ${formatSlot(slot)}`;
    await Promise.all([
      notify(
        user.id,
        "Inspection requested",
        `Your inspection of ${selected.projects?.name ?? "your property"} is booked for ${when}. Reference ${data.reference}.`,
        "/inspections",
      ),
      notifyStaffForProject(
        selected.project_id,
        "New inspection request",
        `${profile?.full_name ?? user.email} requested an inspection for ${when} (${data.reference}).`,
        "/admin/inspections",
      ),
      logEvent(
        selected.id,
        "inspection_requested",
        `${data.reference} · ${when}`,
        profile?.full_name ?? undefined,
      ),
    ]);

    queryClient.invalidateQueries({ queryKey: ["my-inspections"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    toast.success(`Inspection ${data.reference} confirmed for ${when}.`);
    navigate({ to: "/inspections" });
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/inspections">
          <ChevronLeft className="mr-1 size-4" /> My inspections
        </Link>
      </Button>

      <p className="eyebrow mt-4 text-primary">Site visit</p>
      <h1 className="mt-2 font-display text-4xl">Schedule an inspection</h1>

      <ol className="mt-6 flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={cn(
              "eyebrow rounded-full border px-3 py-1",
              i === step
                ? "border-primary bg-primary/10 text-primary"
                : i < step
                  ? "border-border bg-muted text-muted-foreground"
                  : "border-border text-muted-foreground",
            )}
          >
            {i < step ? <Check className="mr-1 inline size-3" /> : null}
            {label}
          </li>
        ))}
      </ol>

      <div className="mt-8 rounded-lg border border-border bg-card p-5 sm:p-6">
        {step === 0 ? (
          apps.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          ) : (apps.data?.length ?? 0) === 0 ? (
            <EmptyState
              title="No investment to inspect yet"
              body="Start an application and select a property to book a guided inspection."
              action={
                <Button asChild>
                  <Link to="/application">Start application</Link>
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {apps.data?.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => {
                    setAppId(app.id);
                    setSlot(null);
                  }}
                  className={cn(
                    "w-full rounded-lg border p-4 text-left transition-colors",
                    appId === app.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-xl leading-tight">
                        {app.projects?.name ?? "Project"}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {app.properties?.name ?? "Property not selected"}
                        {app.properties?.size_label ? ` · ${app.properties.size_label}` : ""}
                        {app.properties?.property_type ? ` · ${app.properties.property_type}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {app.reference ?? "Draft"} · {app.projects?.location ?? ""}
                      </p>
                    </div>
                    <StatusBadge status={app.status} />
                  </div>
                </button>
              ))}
            </div>
          )
        ) : null}

        {step === 1 ? (
          <div className="flex justify-center">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => {
                setDate(d);
                setSlot(null);
              }}
              disabled={{ before: today }}
              className="rounded-lg border border-border"
            />
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <p className="text-sm text-muted-foreground">
              Available times for {formatDate(dateKey)} at {selected?.projects?.name}.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {INSPECTION_SLOTS.map((time) => {
                const disabled = taken.isLoading || (taken.data?.has(time) ?? false);
                return (
                  <button
                    key={time}
                    type="button"
                    disabled={disabled}
                    onClick={() => setSlot(time)}
                    className={cn(
                      "rounded-lg border px-3 py-3 text-sm font-semibold transition-colors",
                      slot === time
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/40",
                      disabled && "cursor-not-allowed opacity-40",
                    )}
                  >
                    {formatSlot(time)}
                  </button>
                );
              })}
            </div>
            {taken.data && taken.data.size > 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Greyed-out times are already booked.
              </p>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="attendees">Number of visitors</Label>
              <Input
                id="attendees"
                type="number"
                min={1}
                max={20}
                inputMode="numeric"
                value={attendees}
                onChange={(e) => setAttendees(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={contactPhone}
                onChange={(e) => {
                  setTouchedContact(true);
                  setPhone(e.target.value);
                }}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={contactEmail}
                onChange={(e) => {
                  setTouchedContact(true);
                  setEmail(e.target.value);
                }}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="notes">Special request or notes (optional)</Label>
              <Textarea
                id="notes"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <dl className="grid gap-4 sm:grid-cols-2">
            {[
              ["Project", selected?.projects?.name ?? "—"],
              ["Property", selected?.properties?.name ?? "—"],
              ["Application", selected?.reference ?? "Draft"],
              ["Inspection date", formatDate(dateKey)],
              ["Inspection time", formatSlot(slot)],
              ["Visitors", attendees],
              ["Investor", profile?.full_name ?? user?.email ?? "—"],
              ["Phone", contactPhone],
              ["Email", contactEmail],
              ["Notes", notes || "—"],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="eyebrow text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-sm font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      <div className="kv-safe-bottom mt-6 flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="outline"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          Back
        </Button>
        {step < 4 ? (
          <Button disabled={!canContinue} onClick={() => setStep((s) => s + 1)}>
            Continue
          </Button>
        ) : (
          <AsyncButton onClick={submit} pendingLabel="Confirming…">
            <CalendarDays className="mr-2 size-4" /> Confirm inspection
          </AsyncButton>
        )}
      </div>
    </div>
  );
}

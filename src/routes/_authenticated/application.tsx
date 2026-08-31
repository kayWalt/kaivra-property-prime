import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, CloudOff, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AsyncButton } from "@/components/kaivra/AsyncButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UploadCard, uploadDocument, type UploadedDoc } from "@/components/kaivra/FileUpload";
import { SignaturePad } from "@/components/kaivra/SignaturePad";
import { PaymentBadge } from "@/components/kaivra/StatusBadge";
import { useProfile, useSession } from "@/hooks/useAuth";
import { fetchDocuments, fetchPayments, logEvent, notifyStaffForProject, totals } from "@/lib/applications";
import {
  APPLICATION_STEPS,
  PAYMENT_METHODS,
  formatNaira,
  formatDate,
  type ContactDetails,
  type InvestmentDetails,
  type PaymentInfo,
  type PaymentMethod,
  type PersonalDetails,
} from "@/lib/kaivra";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/application")({
  validateSearch: (search: Record<string, unknown>) => {
    const out: { id?: string | undefined; project?: string | undefined; property?: string | undefined } = {};
    if (typeof search['id'] === "string") out.id = search['id'];
    if (typeof search['project'] === "string") out.project = search['project'];
    if (typeof search['property'] === "string") out.property = search['property'];
    return out;
  },
  head: () => ({
    meta: [
      { title: "KAIVRA | Investor Application" },
      { name: "description", content: "Complete your real-estate investment subscription in a few simple steps." },
      { property: "og:title", content: "KAIVRA | Investor Application" },
      { property: "og:description", content: "Complete your investment subscription." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ApplicationWizard,
});

type SaveState = "idle" | "saving" | "saved" | "offline";

interface DraftState {
  project_id: string | null;
  property_id: string | null;
  personal: PersonalDetails;
  contact: ContactDetails;
  investment: InvestmentDetails;
  payment_info: PaymentInfo;
  declaration_accepted: boolean;
  current_step: number;
}

const EMPTY_DRAFT: DraftState = {
  project_id: null,
  property_id: null,
  personal: {},
  contact: {},
  investment: { units: 1, payment_plan: "Outright" },
  payment_info: {},
  declaration_accepted: false,
  current_step: 1,
};

function localKey(id: string) {
  return `kaivra:application:${id}`;
}

function ApplicationWizard() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const { data: profile } = useProfile(user?.id);

  const [applicationId, setApplicationId] = useState<string | null>(search.id ?? null);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [step, setStep] = useState(1);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ reference: string; id: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [initialised, setInitialised] = useState(false);
  const pendingRef = useRef<DraftState | null>(null);
  const bootRef = useRef(false);

  // ---------- data ----------
  const projects = useQuery({
    queryKey: ["projects-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const properties = useQuery({
    queryKey: ["properties", draft.project_id],
    enabled: !!draft.project_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .eq("project_id", draft.project_id!)
        .eq("is_active", true)
        .order("unit_price", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const payments = useQuery({
    queryKey: ["payments", applicationId],
    enabled: !!applicationId,
    queryFn: () => fetchPayments(applicationId!),
  });

  const documents = useQuery({
    queryKey: ["documents", applicationId],
    enabled: !!applicationId,
    queryFn: () => fetchDocuments(applicationId!),
  });

  const existing = useQuery({
    queryKey: ["application", applicationId],
    enabled: !!applicationId,
    queryFn: async () => {
      const { data, error } = await supabase.from("applications").select("*").eq("id", applicationId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // ---------- bootstrap: load or create the draft ----------
  useEffect(() => {
    if (initialised || bootRef.current || !user) return;
    bootRef.current = true;
    // No cancellation: bootRef already guarantees the bootstrap runs once.
    // Aborting it on re-render/StrictMode remount left the wizard stuck on
    // skeletons because the retry was blocked by bootRef.

    async function boot() {
      if (search.id) {
        const { data } = await supabase.from("applications").select("*").eq("id", search.id!).maybeSingle();
        if (data) {
          const cached = typeof window !== "undefined" ? window.localStorage.getItem(localKey(data.id)) : null;
          const base: DraftState = {
            project_id: data.project_id,
            property_id: data.property_id,
            personal: (data.personal ?? {}) as PersonalDetails,
            contact: (data.contact ?? {}) as ContactDetails,
            investment: (data.investment ?? { units: 1 }) as InvestmentDetails,
            payment_info: (data.payment_info ?? {}) as PaymentInfo,
            declaration_accepted: !!data.declaration_accepted,
            current_step: data.current_step ?? 1,
          };
          let next = base;
          if (cached) {
            try {
              const parsed = JSON.parse(cached) as { savedAt: number; draft: DraftState };
              if (parsed.savedAt > new Date(data.updated_at ?? 0).getTime()) next = parsed.draft;
            } catch {
              /* ignore malformed cache */
            }
          }
          setApplicationId(data.id);
          setDraft(next);
          setStep(next.current_step || 1);
          setInitialised(true);
          return;
        }
      }

      // Reuse the investor's most recent untouched draft instead of creating a
      // new empty application every time the wizard is opened.
      const { data: reusable } = await supabase
        .from("applications")
        .select("id")
        .eq("investor_id", user!.id)
        .eq("status", "draft")
        .is("reference", null)
        .is("project_id", null)
        .is("property_id", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (reusable && !search.project && !search.property) {
        setApplicationId(reusable.id);
        setDraft({
          ...EMPTY_DRAFT,
          personal: { full_name: profile?.full_name ?? "" },
          contact: { email: profile?.email ?? user?.email ?? "", phone: profile?.phone ?? "" },
        });
        setInitialised(true);
        void navigate({ to: "/application", search: { id: reusable.id }, replace: true });
        return;
      }

      // create a fresh draft

      const seed: DraftState = {
        ...EMPTY_DRAFT,
        project_id: search.project ?? null,
        property_id: search.property ?? null,
        personal: { full_name: profile?.full_name ?? "" },
        contact: { email: profile?.email ?? user?.email ?? "", phone: profile?.phone ?? "" },
      };
      const { data, error } = await supabase
        .from("applications")
        .insert({
          investor_id: user!.id,
          created_by: user!.id,
          project_id: seed.project_id,
          property_id: seed.property_id,
          personal: seed.personal as never,
          contact: seed.contact as never,
          investment: seed.investment as never,
          payment_info: {} as never,
          current_step: 1,
        })
        .select()
        .single();
      if (error || !data) {
        bootRef.current = false;
        toast.error("We could not start your application. Please try again.");
        return;
      }
      setApplicationId(data.id);
      setDraft(seed);
      setInitialised(true);
      void logEvent(data.id, "application_created", "Application draft created");
      void navigate({ to: "/application", search: { id: data.id }, replace: true });
    }

    void boot();
  }, [user, profile, search.id, search.project, search.property, initialised, navigate]);


  // ---------- autosave ----------
  const persist = useCallback(
    async (next: DraftState) => {
      if (!applicationId) return;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(localKey(applicationId), JSON.stringify({ savedAt: Date.now(), draft: next }));
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        pendingRef.current = next;
        setSaveState("offline");
        return;
      }
      setSaveState("saving");
      // Persist the derived money fields so detail pages, admin views and the
      // PDF all read the same totals as the wizard.
      const savedUnits = Math.max(1, Number(next.investment.units ?? 1));
      const savedUnitPrice = Number(next.investment.unit_price ?? 0);
      const normalisedInvestment = {
        ...next.investment,
        units: savedUnits,
        unit_price: savedUnitPrice,
        total_value: savedUnitPrice * savedUnits,
      };
      const { error } = await supabase
        .from("applications")
        .update({
          project_id: next.project_id,
          property_id: next.property_id,
          personal: next.personal as never,
          contact: next.contact as never,
          investment: normalisedInvestment as never,
          payment_info: next.payment_info as never,
          declaration_accepted: next.declaration_accepted,
          current_step: next.current_step,
        })
        .eq("id", applicationId);
      if (error) {
        pendingRef.current = next;
        setSaveState("offline");
        return;
      }
      pendingRef.current = null;
      setSaveState("saved");
    },
    [applicationId],
  );

  useEffect(() => {
    if (!initialised || !applicationId) return;
    const timer = window.setTimeout(() => void persist({ ...draft, current_step: step }), 1200);
    return () => window.clearTimeout(timer);
  }, [draft, step, initialised, applicationId, persist]);

  useEffect(() => {
    function online() {
      if (pendingRef.current) void persist(pendingRef.current);
    }
    window.addEventListener("online", online);
    window.addEventListener("offline", () => setSaveState("offline"));
    return () => {
      window.removeEventListener("online", online);
    };
  }, [persist]);

  // ---------- derived ----------
  const selectedProject = projects.data?.find((p) => p.id === draft.project_id) ?? null;
  const selectedProperty = properties.data?.find((p) => p.id === draft.property_id) ?? null;
  const unitPrice = Number(draft.investment.unit_price ?? selectedProperty?.unit_price ?? 0);
  const units = Math.max(1, Number(draft.investment.units ?? 1));
  const totalValue = unitPrice * units;
  const { paid, outstanding } = useMemo(
    () => totals(payments.data ?? [], totalValue),
    [payments.data, totalValue],
  );

  const docs = (documents.data ?? []) as unknown as UploadedDoc[];
  const passportDocs = docs.filter((d) => d.kind === "passport");
  const signatureDocs = docs.filter((d) => d.kind === "signature");
  const proofDocs = docs.filter((d) => d.kind === "proof_of_payment");
  const additionalDocs = docs.filter((d) => d.kind === "additional");

  const readOnly = existing.data?.status && !["draft", "requires_correction"].includes(existing.data.status);

  function set<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function validateStep(target: number): boolean {
    const next: Record<string, string> = {};
    if (target === 1) {
      if (!draft.project_id) next['project'] = "Select a project to continue.";
      if (!draft.property_id) next['property'] = "Select a property to continue.";
    }
    if (target === 2) {
      if (!draft.personal.full_name?.trim()) next['full_name'] = "Full name is required.";
      if (!draft.personal.date_of_birth) next['date_of_birth'] = "Date of birth is required.";
      if (!draft.personal.residential_address?.trim())
        next['residential_address'] = "Residential address is required.";
    }
    if (target === 3) {
      if (!draft.contact.phone?.trim()) next['phone'] = "Phone number is required.";
      const email = draft.contact.email?.trim() ?? "";
      if (!email) next['email'] = "Email address is required.";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next['email'] = "Enter a valid email address.";
    }
    if (target === 6) {
      if (passportDocs.length === 0) next['passport'] = "Upload your passport photograph.";
      if (signatureDocs.length === 0) next['signature'] = "Provide your signature.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function goto(target: number) {
    if (target > step && !validateStep(step)) return;
    setStep(Math.min(7, Math.max(1, target)));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function addPayment(form: PaymentDraft) {
    if (!applicationId) return;
    const { error } = await supabase.from("application_payments").insert({
      application_id: applicationId,
      amount: form.amount,
      paid_on: form.paid_on || null,
      bank: form.bank || null,
      sender: form.sender || null,
      reference: form.reference || null,
      method: form.method as never,
      description: form.description || null,
    });
    if (error) {
      toast.error("Your payment record could not be saved. Please try again.");
      return;
    }
    toast.success("Payment record added.");
    void logEvent(applicationId, "payment_added", `${formatNaira(form.amount)} recorded`);
    void payments.refetch();
  }

  async function removePayment(id: string) {
    if (!applicationId) return;
    const { error } = await supabase.from("application_payments").delete().eq("id", id);
    if (error) {
      toast.error("This payment could not be removed.");
      return;
    }
    void payments.refetch();
    void documents.refetch();
  }

  async function submit() {
    if (!applicationId || !user) return;
    setSubmitting(true);
    try {
      await persist({ ...draft, current_step: 7 });
      const { data, error } = await supabase
        .from("applications")
        .update({ status: "submitted", submitted_at: new Date().toISOString(), declaration_accepted: true })
        .eq("id", applicationId)
        .select("reference, project_id")
        .single();
      if (error || !data) throw error ?? new Error("submit failed");

      await logEvent(applicationId, "application_submitted", `Reference ${data.reference}`);
      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "Application submitted",
        body: `Your application ${data.reference} has been submitted and is now under review.`,
        link: `/applications/${applicationId}`,
      });
      await notifyStaffForProject(
        data.project_id,
        "New application submitted",
        `${draft.personal.full_name ?? "An investor"} submitted application ${data.reference}.`,
        `/admin/applications/${applicationId}`,
      );
      if (typeof window !== "undefined") window.localStorage.removeItem(localKey(applicationId));
      void queryClient.invalidateQueries({ queryKey: ["my-applications"] });
      setSubmitted({ reference: data.reference ?? "", id: applicationId });
      setConfirmOpen(false);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return <SuccessScreen reference={submitted.reference} applicationId={submitted.id} />;
  }

  if (!initialised) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-12">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-32 pt-8 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="eyebrow text-primary">Investment application</p>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl">
            {APPLICATION_STEPS[step - 1]?.label ?? "Application"}
          </h1>
        </div>
        <SaveIndicator state={saveState} />
      </div>

      {readOnly ? (
        <p className="mt-4 rounded-md border border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          This application has been submitted and can no longer be edited.
        </p>
      ) : null}

      <ol className="mt-6 flex gap-1 overflow-x-auto pb-2" aria-label="Application progress">
        {APPLICATION_STEPS.map((s) => (
          <li key={s.key} className="min-w-[5.5rem] flex-1">
            <button
              type="button"
              onClick={() => goto(s.n)}
              aria-current={s.n === step ? "step" : undefined}
              className={cn(
                "w-full border-t-2 pt-2 text-left transition-colors",
                s.n === step
                  ? "border-primary text-foreground"
                  : s.n < step
                    ? "border-primary/40 text-muted-foreground"
                    : "border-border text-muted-foreground",
              )}
            >
              <span className="block text-[0.65rem] font-semibold tracking-widest">
                {String(s.n).padStart(2, "0")}
              </span>
              <span className="block text-xs font-medium uppercase tracking-wide">{s.label}</span>
            </button>
          </li>
        ))}
      </ol>

      <div key={step} className="animate-step mt-8">
        {step === 1 ? (
          <StepProject
            projects={projects.data ?? []}
            properties={properties.data ?? []}
            loadingProjects={projects.isLoading}
            loadingProperties={properties.isLoading}
            draft={draft}
            errors={errors}
            disabled={!!readOnly}
            onProject={(id) => setDraft((p) => ({ ...p, project_id: id, property_id: null }))}
            onProperty={(property) =>
              setDraft((p) => ({
                ...p,
                property_id: property.id,
                investment: {
                  ...p.investment,
                  unit_price: Number(property.unit_price),
                  property_type: property.property_type ?? "",
                  property_size: property.size_label ?? "",
                  units: p.investment.units ?? 1,
                },
              }))
            }
          />
        ) : null}

        {step === 2 ? (
          <StepPersonal
            value={draft.personal}
            errors={errors}
            disabled={!!readOnly}
            onChange={(personal) => set("personal", personal)}
          />
        ) : null}

        {step === 3 ? (
          <StepContact
            value={draft.contact}
            residential={draft.personal.residential_address ?? ""}
            errors={errors}
            disabled={!!readOnly}
            onChange={(contact) => set("contact", contact)}
          />
        ) : null}

        {step === 4 ? (
          <StepInvestment
            projectName={selectedProject?.name ?? "—"}
            propertyName={selectedProperty?.name ?? "—"}
            propertyType={selectedProperty?.property_type ?? "—"}
            propertySize={selectedProperty?.size_label ?? "—"}
            unitPrice={unitPrice}
            units={units}
            totalValue={totalValue}
            paid={paid}
            outstanding={outstanding}
            plan={draft.investment.payment_plan ?? "Outright"}
            disabled={!!readOnly}
            onUnits={(value) =>
              setDraft((p) => ({ ...p, investment: { ...p.investment, units: value, total_value: unitPrice * value } }))
            }
            onPlan={(plan) => setDraft((p) => ({ ...p, investment: { ...p.investment, payment_plan: plan } }))}
          />
        ) : null}

        {step === 5 ? (
          <StepPayment
            info={draft.payment_info}
            disabled={!!readOnly}
            onChange={(info) => set("payment_info", info)}
            payments={payments.data ?? []}
            onAdd={addPayment}
            onRemove={removePayment}
            paid={paid}
            outstanding={outstanding}
            defaults={{
              subscriber_name: draft.personal.full_name ?? "",
              site: selectedProject?.name ?? "",
            }}
          />
        ) : null}

        {step === 6 && applicationId ? (
          <StepDocuments
            applicationId={applicationId}
            disabled={!!readOnly}
            errors={errors}
            passportDocs={passportDocs}
            signatureDocs={signatureDocs}
            proofDocs={proofDocs}
            additionalDocs={additionalDocs}
            onChanged={() => void documents.refetch()}
          />
        ) : null}

        {step === 7 ? (
          <StepReview
            draft={draft}
            projectName={selectedProject?.name ?? "—"}
            propertyName={selectedProperty?.name ?? "—"}
            totalValue={totalValue}
            paid={paid}
            outstanding={outstanding}
            payments={payments.data ?? []}
            documents={docs}
            disabled={!!readOnly}
            onEdit={(target) => goto(target)}
            onDeclaration={(accepted) => set("declaration_accepted", accepted)}
          />
        ) : null}
      </div>

      <div className="kv-safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => {
              if (step > 1) {
                goto(step - 1);
              } else if (window.history.length > 1) {
                window.history.back();
              } else {
                void navigate({ to: "/applications" });
              }
            }}
          >
            <ChevronLeft className="mr-1 size-4" /> Back
          </Button>
          {step < 7 ? (
            <Button size="lg" className="min-w-40" onClick={() => goto(step + 1)}>
              Continue <ChevronRight className="ml-1 size-4" />
            </Button>
          ) : (
            <Button
              size="lg"
              className="min-w-48"
              disabled={!draft.declaration_accepted || submitting || !!readOnly}
              onClick={() => setConfirmOpen(true)}
            >
              Submit application
            </Button>
          )}
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Submit application?</DialogTitle>
            <DialogDescription>
              Please review your information carefully before submitting. You will not be able to edit the application
              once submitted unless a correction is requested.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <AsyncButton onClick={() => submit()} disabled={submitting} pendingLabel="Submitting…">
              Submit
            </AsyncButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const map = {
    saving: { icon: <Loader2 className="size-3.5 animate-spin" />, text: "Saving…" },
    saved: { icon: <Check className="size-3.5" />, text: "Saved" },
    offline: { icon: <CloudOff className="size-3.5" />, text: "Offline — saved on this device" },
  } as const;
  const item = map[state];
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground" aria-live="polite">
      {item.icon}
      {item.text}
    </span>
  );
}

function Field({
  label,
  error,
  required,
  children,
  htmlFor,
}: {
  label: string;
  error?: string | undefined;
  required?: boolean | undefined;
  children: React.ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function StepProject({
  projects,
  properties,
  loadingProjects,
  loadingProperties,
  draft,
  errors,
  disabled,
  onProject,
  onProperty,
}: {
  projects: { id: string; name: string; location: string | null; hero_image: string | null; gallery_images?: unknown }[];
  properties: {
    id: string;
    name: string;
    property_type: string | null;
    size_label: string | null;
    unit_price: number;
    units_available: number | null;
    image_urls: unknown;
  }[];
  loadingProjects: boolean;
  loadingProperties: boolean;
  draft: DraftState;
  errors: Record<string, string>;
  disabled: boolean;
  onProject: (id: string) => void;
  onProperty: (property: {
    id: string;
    property_type: string | null;
    size_label: string | null;
    unit_price: number;
  }) => void;
}) {
  const selectedProject = projects.find((p) => p.id === draft.project_id);
  // When a property has no images of its own, fall back to the project's
  // gallery so investors still see the linked imagery.
  const fallbackPropertyImages = [
    ...parseGallery(selectedProject?.gallery_images).map((g) => g.url),
    ...(selectedProject?.hero_image ? [selectedProject.hero_image] : []),
  ];
  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-display text-2xl">Select your investment</h2>
        {errors['project'] ? <p className="mt-1 text-xs text-destructive">{errors['project']}</p> : null}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {loadingProjects ? [0, 1].map((i) => <Skeleton key={i} className="h-48 rounded-lg" />) : null}
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              disabled={disabled}
              onClick={() => onProject(project.id)}
              className={cn(
                "overflow-hidden rounded-lg border text-left transition-shadow hover:shadow-card",
                draft.project_id === project.id ? "border-primary ring-1 ring-primary" : "border-border",
              )}
            >
              <img
                src={project.hero_image ?? "/images/project-mountain.jpg"}
                alt={project.name}
                loading="lazy"
                width={1280}
                height={720}
                className="h-32 w-full object-cover"
              />
              <span className="block p-4">
                <span className="block font-display text-xl leading-tight">{project.name}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{project.location}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {draft.project_id ? (
        <section>
          <h2 className="font-display text-2xl">Choose your property</h2>
          {errors['property'] ? <p className="mt-1 text-xs text-destructive">{errors['property']}</p> : null}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {loadingProperties ? [0, 1].map((i) => <Skeleton key={i} className="h-40 rounded-lg" />) : null}
            {properties.map((property) => (
              <PropertyCard
                key={property.id}
                property={property}
                fallbackImages={fallbackPropertyImages}
                selected={draft.property_id === property.id}
                disabled={disabled}
                onSelect={() => onProperty(property)}
              />
            ))}
            {!loadingProperties && properties.length === 0 ? (
              <p className="text-sm text-muted-foreground">No properties are currently available for this project.</p>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StepPersonal({
  value,
  errors,
  disabled,
  onChange,
}: {
  value: PersonalDetails;
  errors: Record<string, string>;
  disabled: boolean;
  onChange: (value: PersonalDetails) => void;
}) {
  const update = (patch: Partial<PersonalDetails>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Full name" required error={errors['full_name']} htmlFor="full_name">
        <Input
          id="full_name"
          disabled={disabled}
          value={value.full_name ?? ""}
          onChange={(e) => update({ full_name: e.target.value })}
        />
      </Field>
      <Field label="Date of birth" required error={errors['date_of_birth']} htmlFor="dob">
        <Input
          id="dob"
          type="date"
          disabled={disabled}
          value={value.date_of_birth ?? ""}
          onChange={(e) => update({ date_of_birth: e.target.value })}
        />
      </Field>
      <Field label="Gender" htmlFor="gender">
        <select
          id="gender"
          disabled={disabled}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={value.gender ?? ""}
          onChange={(e) => update({ gender: e.target.value })}
        >
          <option value="">Select</option>
          <option>Male</option>
          <option>Female</option>
          <option>Prefer not to say</option>
        </select>
      </Field>
      <Field label="Nationality" htmlFor="nationality">
        <Input
          id="nationality"
          disabled={disabled}
          value={value.nationality ?? ""}
          onChange={(e) => update({ nationality: e.target.value })}
        />
      </Field>
      <Field label="Marital status" htmlFor="marital">
        <select
          id="marital"
          disabled={disabled}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={value.marital_status ?? ""}
          onChange={(e) => update({ marital_status: e.target.value })}
        >
          <option value="">Select</option>
          <option>Single</option>
          <option>Married</option>
          <option>Divorced</option>
          <option>Widowed</option>
        </select>
      </Field>
      <Field label="Occupation" htmlFor="occupation">
        <Input
          id="occupation"
          disabled={disabled}
          value={value.occupation ?? ""}
          onChange={(e) => update({ occupation: e.target.value })}
        />
      </Field>
      <Field label="Company / Organisation" htmlFor="company">
        <Input
          id="company"
          disabled={disabled}
          value={value.company ?? ""}
          onChange={(e) => update({ company: e.target.value })}
        />
      </Field>
      <Field label="State" htmlFor="state">
        <Input
          id="state"
          disabled={disabled}
          value={value.state ?? ""}
          onChange={(e) => update({ state: e.target.value })}
        />
      </Field>
      <Field label="Country" htmlFor="country">
        <Input
          id="country"
          disabled={disabled}
          value={value.country ?? ""}
          onChange={(e) => update({ country: e.target.value })}
        />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Residential address" required error={errors['residential_address']} htmlFor="address">
          <Textarea
            id="address"
            rows={3}
            disabled={disabled}
            value={value.residential_address ?? ""}
            onChange={(e) => update({ residential_address: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

function StepContact({
  value,
  residential,
  errors,
  disabled,
  onChange,
}: {
  value: ContactDetails;
  residential: string;
  errors: Record<string, string>;
  disabled: boolean;
  onChange: (value: ContactDetails) => void;
}) {
  const update = (patch: Partial<ContactDetails>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Phone number" required error={errors['phone']} htmlFor="phone">
        <Input
          id="phone"
          type="tel"
          inputMode="tel"
          placeholder="+234 800 000 0000"
          disabled={disabled}
          value={value.phone ?? ""}
          onChange={(e) => update({ phone: e.target.value })}
        />
      </Field>
      <Field label="Email address" required error={errors['email']} htmlFor="email">
        <Input
          id="email"
          type="email"
          disabled={disabled}
          value={value.email ?? ""}
          onChange={(e) => update({ email: e.target.value })}
        />
      </Field>
      <Field label="WhatsApp number" htmlFor="whatsapp">
        <Input
          id="whatsapp"
          type="tel"
          placeholder="+234 800 000 0000"
          disabled={disabled}
          value={value.whatsapp ?? ""}
          onChange={(e) => update({ whatsapp: e.target.value })}
        />
      </Field>
      <Field label="Alternative phone" htmlFor="alt_phone">
        <Input
          id="alt_phone"
          type="tel"
          disabled={disabled}
          value={value.alt_phone ?? ""}
          onChange={(e) => update({ alt_phone: e.target.value })}
        />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Residential address" htmlFor="contact_address">
          <Textarea
            id="contact_address"
            rows={2}
            disabled={disabled}
            value={value.residential_address ?? residential}
            onChange={(e) => update({ residential_address: e.target.value })}
          />
        </Field>
      </div>
      <div className="sm:col-span-2 space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={!!value.mailing_same_as_residential}
            disabled={disabled}
            onCheckedChange={(checked) =>
              update({
                mailing_same_as_residential: !!checked,
                mailing_address: checked ? (value.residential_address ?? residential) : (value.mailing_address ?? ""),
              })
            }
          />
          Same as residential address
        </label>
        <Field label="Mailing address" htmlFor="mailing">
          <Textarea
            id="mailing"
            rows={2}
            disabled={disabled || !!value.mailing_same_as_residential}
            value={value.mailing_address ?? ""}
            onChange={(e) => update({ mailing_address: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone?: "primary" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="eyebrow text-muted-foreground">{label}</p>
      <p className={cn("mt-2 font-display text-2xl", tone === "primary" && "text-primary")}>{value}</p>
    </div>
  );
}

function StepInvestment(props: {
  projectName: string;
  propertyName: string;
  propertyType: string;
  propertySize: string;
  unitPrice: number;
  units: number;
  totalValue: number;
  paid: number;
  outstanding: number;
  plan: string;
  disabled: boolean;
  onUnits: (value: number) => void;
  onPlan: (plan: string) => void;
}) {
  return (
    <div className="space-y-8">
      <dl className="grid gap-4 sm:grid-cols-2">
        {[
          ["Project", props.projectName],
          ["Property", props.propertyName],
          ["Property type", props.propertyType],
          ["Property size", props.propertySize],
          ["Unit price", formatNaira(props.unitPrice)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-border px-4 py-3">
            <dt className="eyebrow text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-sm font-medium">{value}</dd>
          </div>
        ))}
        <div className="rounded-md border border-border px-4 py-3">
          <dt className="eyebrow text-muted-foreground">Number of units</dt>
          <dd className="mt-1">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              disabled={props.disabled}
              value={props.units}
              onChange={(e) => props.onUnits(Math.max(1, Number(e.target.value) || 1))}
              className="h-9 w-28"
              aria-label="Number of units"
            />
          </dd>
        </div>
      </dl>

      <div>
        <p className="eyebrow text-muted-foreground">Payment plan</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {["Outright", "Installment", "Custom"].map((plan) => (
            <Button
              key={plan}
              type="button"
              variant={props.plan === plan ? "default" : "outline"}
              disabled={props.disabled}
              onClick={() => props.onPlan(plan)}
            >
              {plan}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryTile label="Total investment" value={formatNaira(props.totalValue)} />
        <SummaryTile label="Total paid" value={formatNaira(props.paid)} tone="primary" />
        <SummaryTile label="Outstanding" value={formatNaira(props.outstanding)} />
      </div>
    </div>
  );
}

interface PaymentDraft {
  amount: number;
  paid_on: string;
  bank: string;
  sender: string;
  reference: string;
  method: PaymentMethod;
  description: string;
}

const EMPTY_PAYMENT: PaymentDraft = {
  amount: 0,
  paid_on: "",
  bank: "",
  sender: "",
  reference: "",
  method: "bank_transfer",
  description: "",
};

function StepPayment({
  info,
  disabled,
  onChange,
  payments,
  onAdd,
  onRemove,
  paid,
  outstanding,
  defaults,
}: {
  info: PaymentInfo;
  disabled: boolean;
  onChange: (info: PaymentInfo) => void;
  payments: {
    id: string;
    amount: number | string;
    paid_on: string | null;
    bank: string | null;
    reference: string | null;
    status: string;
  }[];
  onAdd: (payment: PaymentDraft) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  paid: number;
  outstanding: number;
  defaults: { subscriber_name: string; site: string };
}) {
  const [form, setForm] = useState<PaymentDraft>(EMPTY_PAYMENT);
  const [adding, setAdding] = useState(false);
  const update = (patch: Partial<PaymentInfo>) => onChange({ ...info, ...patch });

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-display text-2xl">Payment confirmation</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <Field label="Subscriber's name" htmlFor="subscriber">
            <Input
              id="subscriber"
              disabled={disabled}
              value={info.subscriber_name ?? defaults.subscriber_name}
              onChange={(e) => update({ subscriber_name: e.target.value })}
            />
          </Field>
          <Field label="Sender" htmlFor="pay_sender">
            <Input
              id="pay_sender"
              disabled={disabled}
              value={info.sender ?? ""}
              onChange={(e) => update({ sender: e.target.value })}
            />
          </Field>
          <Field label="Bank" htmlFor="pay_bank">
            <Input
              id="pay_bank"
              disabled={disabled}
              value={info.bank ?? ""}
              onChange={(e) => update({ bank: e.target.value })}
            />
          </Field>
          <Field label="Site" htmlFor="pay_site">
            <Input
              id="pay_site"
              disabled={disabled}
              value={info.site ?? defaults.site}
              onChange={(e) => update({ site: e.target.value })}
            />
          </Field>
          <Field label="Initial deposit (₦)" htmlFor="deposit">
            <Input
              id="deposit"
              type="number"
              inputMode="numeric"
              min={0}
              disabled={disabled}
              value={info.initial_deposit ?? ""}
              onChange={(e) => update({ initial_deposit: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Next payment amount (₦)" htmlFor="next_amount">
            <Input
              id="next_amount"
              type="number"
              inputMode="numeric"
              min={0}
              disabled={disabled}
              value={info.next_payment_amount ?? ""}
              onChange={(e) => update({ next_payment_amount: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Next payment date" htmlFor="next_date">
            <Input
              id="next_date"
              type="date"
              disabled={disabled}
              value={info.next_payment_date ?? ""}
              onChange={(e) => update({ next_payment_date: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Payment description" htmlFor="pay_desc">
              <Textarea
                id="pay_desc"
                rows={2}
                disabled={disabled}
                value={info.description ?? ""}
                onChange={(e) => update({ description: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-2xl">Payment records</h2>
          <p className="text-sm text-muted-foreground">
            Paid <strong className="text-primary">{formatNaira(paid)}</strong> · Outstanding{" "}
            <strong>{formatNaira(outstanding)}</strong>
          </p>
        </div>

        <ul className="mt-4 space-y-2">
          {payments.length === 0 ? (
            <li className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              No payment records yet.
            </li>
          ) : null}
          {payments.map((payment, index) => (
            <li
              key={payment.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-4 py-3"
            >
              <div>
                <p className="eyebrow text-muted-foreground">Payment {String(index + 1).padStart(2, "0")}</p>
                <p className="mt-1 text-sm font-semibold">{formatNaira(payment.amount)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(payment.paid_on)} · {payment.bank ?? "—"} · {payment.reference ?? "no reference"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <PaymentBadge status={payment.status as "pending" | "verified" | "rejected"} />
                {!disabled && payment.status !== "verified" ? (
                  <AsyncButton variant="ghost" size="icon" aria-label="Remove payment" onClick={() => onRemove(payment.id)}>
                    <Trash2 className="size-4" />
                  </AsyncButton>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        {!disabled ? (
          <div className="mt-6 rounded-lg border border-border bg-card p-4">
            <p className="eyebrow text-primary">Add payment</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Amount (₦)" htmlFor="amount">
                <Input
                  id="amount"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={form.amount || ""}
                  onChange={(e) => setForm({ ...form, amount: Number(e.target.value) || 0 })}
                />
              </Field>
              <Field label="Paid date" htmlFor="paid_on">
                <Input
                  id="paid_on"
                  type="date"
                  value={form.paid_on}
                  onChange={(e) => setForm({ ...form, paid_on: e.target.value })}
                />
              </Field>
              <Field label="Bank" htmlFor="bank">
                <Input id="bank" value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} />
              </Field>
              <Field label="Sender" htmlFor="sender">
                <Input id="sender" value={form.sender} onChange={(e) => setForm({ ...form, sender: e.target.value })} />
              </Field>
              <Field label="Transaction reference" htmlFor="reference">
                <Input
                  id="reference"
                  value={form.reference}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                />
              </Field>
              <Field label="Payment method" htmlFor="method">
                <select
                  id="method"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.method}
                  onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Description" htmlFor="desc">
                  <Input
                    id="desc"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </Field>
              </div>
            </div>
            <AsyncButton
              className="mt-4"
              disabled={adding || form.amount <= 0}
              pendingLabel="Adding payment…"
              onClick={async () => {
                setAdding(true);
                try {
                  await onAdd(form);
                  setForm(EMPTY_PAYMENT);
                } finally {
                  setAdding(false);
                }
              }}
            >
              <Plus className="mr-2 size-4" />
              Add payment
            </AsyncButton>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function StepDocuments({
  applicationId,
  disabled,
  errors,
  passportDocs,
  signatureDocs,
  proofDocs,
  additionalDocs,
  onChanged,
}: {
  applicationId: string;
  disabled: boolean;
  errors: Record<string, string>;
  passportDocs: UploadedDoc[];
  signatureDocs: UploadedDoc[];
  proofDocs: UploadedDoc[];
  additionalDocs: UploadedDoc[];
  onChanged: () => void;
}) {
  const [savingSignature, setSavingSignature] = useState(false);
  const [drawMode, setDrawMode] = useState(false);

  return (
    <div className="space-y-8">
      <header>
        <h2 className="font-display text-2xl">Your documents</h2>
        <p className="mt-1 text-sm text-muted-foreground">Upload clear copies of your documents.</p>
      </header>

      <UploadCard
        title="Passport photograph"
        hint="JPG, PNG or WEBP. Use your camera on mobile."
        capture
        applicationId={applicationId}
        kind="passport"
        existing={passportDocs}
        onChanged={onChanged}
        disabled={disabled}
      />
      {errors['passport'] ? <p className="text-xs text-destructive">{errors['passport']}</p> : null}

      <div className="space-y-3">
        <UploadCard
          title="Investor signature"
          hint="Upload an image of your signature, or draw it below."
          applicationId={applicationId}
          kind="signature"
          existing={signatureDocs}
          onChanged={onChanged}
          disabled={disabled}
        />
        {!disabled ? (
          <div>
            <Button variant="outline" size="sm" onClick={() => setDrawMode((v) => !v)}>
              {drawMode ? "Hide signature pad" : "Draw signature"}
            </Button>
            {drawMode ? (
              <div className="mt-3">
                <SignaturePad
                  saving={savingSignature}
                  onSave={async (blob) => {
                    setSavingSignature(true);
                    try {
                      await uploadDocument({
                        applicationId,
                        kind: "signature",
                        file: blob,
                        fileName: "investor-signature.png",
                        label: "Investor Signature",
                      });
                      toast.success("Signature saved.");
                      onChanged();
                      setDrawMode(false);
                    } catch {
                      toast.error("Your signature could not be saved. Please try again.");
                    } finally {
                      setSavingSignature(false);
                    }
                  }}
                />
              </div>
            ) : null}
          </div>
        ) : null}
        {errors['signature'] ? <p className="text-xs text-destructive">{errors['signature']}</p> : null}
      </div>

      <UploadCard
        title="Proof of payment"
        hint="Photos, scans or PDF receipts. You can upload more than one."
        accept="image/*,application/pdf"
        capture
        multiple
        applicationId={applicationId}
        kind="proof_of_payment"
        existing={proofDocs}
        onChanged={onChanged}
        disabled={disabled}
      />

      <UploadCard
        title="Additional documents"
        hint="Optional: National ID, international passport, driver's licence, voter's card, agreements."
        accept="image/*,application/pdf"
        multiple
        applicationId={applicationId}
        kind="additional"
        existing={additionalDocs}
        onChanged={onChanged}
        disabled={disabled}
      />
    </div>
  );
}

function ReviewSection({
  title,
  step,
  onEdit,
  children,
}: {
  title: string;
  step: number;
  onEdit: (step: number) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl">{title}</h3>
        <Button variant="ghost" size="sm" onClick={() => onEdit(step)}>
          Edit
        </Button>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ReviewRows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="eyebrow text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-sm">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function StepReview({
  draft,
  projectName,
  propertyName,
  totalValue,
  paid,
  outstanding,
  payments,
  documents,
  disabled,
  onEdit,
  onDeclaration,
}: {
  draft: DraftState;
  projectName: string;
  propertyName: string;
  totalValue: number;
  paid: number;
  outstanding: number;
  payments: { id: string; amount: number | string; paid_on: string | null; status: string }[];
  documents: UploadedDoc[];
  disabled: boolean;
  onEdit: (step: number) => void;
  onDeclaration: (accepted: boolean) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryTile label="Total investment" value={formatNaira(totalValue)} />
        <SummaryTile label="Total paid" value={formatNaira(paid)} tone="primary" />
        <SummaryTile label="Outstanding" value={formatNaira(outstanding)} />
      </div>

      <ReviewSection title="Personal" step={2} onEdit={onEdit}>
        <ReviewRows
          rows={[
            ["Full name", draft.personal.full_name ?? ""],
            ["Date of birth", formatDate(draft.personal.date_of_birth)],
            ["Gender", draft.personal.gender ?? ""],
            ["Nationality", draft.personal.nationality ?? ""],
            ["Occupation", draft.personal.occupation ?? ""],
            ["Residential address", draft.personal.residential_address ?? ""],
          ]}
        />
      </ReviewSection>

      <ReviewSection title="Contact" step={3} onEdit={onEdit}>
        <ReviewRows
          rows={[
            ["Phone", draft.contact.phone ?? ""],
            ["Email", draft.contact.email ?? ""],
            ["WhatsApp", draft.contact.whatsapp ?? ""],
            ["Mailing address", draft.contact.mailing_address ?? ""],
          ]}
        />
      </ReviewSection>

      <ReviewSection title="Investment" step={4} onEdit={onEdit}>
        <ReviewRows
          rows={[
            ["Project", projectName],
            ["Property", propertyName],
            ["Units", String(draft.investment.units ?? 1)],
            ["Unit price", formatNaira(draft.investment.unit_price ?? 0)],
            ["Payment plan", draft.investment.payment_plan ?? ""],
            ["Total value", formatNaira(totalValue)],
          ]}
        />
      </ReviewSection>

      <ReviewSection title="Payments" step={5} onEdit={onEdit}>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payment records yet.</p>
        ) : (
          <ul className="space-y-2">
            {payments.map((p, i) => (
              <li key={p.id} className="flex items-center justify-between text-sm">
                <span>
                  Payment {String(i + 1).padStart(2, "0")} · {formatNaira(p.amount)} · {formatDate(p.paid_on)}
                </span>
                <PaymentBadge status={p.status as "pending" | "verified" | "rejected"} />
              </li>
            ))}
          </ul>
        )}
      </ReviewSection>

      <ReviewSection title="Documents" step={6} onEdit={onEdit}>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents uploaded.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center gap-2">
                <Check className="size-4 text-primary" aria-hidden />
                {d.label ?? d.kind.replace(/_/g, " ")} — {d.file_name}
              </li>
            ))}
          </ul>
        )}
      </ReviewSection>

      <section className="rounded-lg border border-border bg-muted/40 p-5">
        <h3 className="font-display text-xl">Investor declaration</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          I confirm that the information provided in this application is true and accurate to the best of my knowledge.
          I confirm that the payment information and documents submitted relate to my investment/application.
        </p>
        <label className="mt-4 flex items-start gap-3 text-sm font-medium">
          <Checkbox
            checked={draft.declaration_accepted}
            disabled={disabled}
            onCheckedChange={(checked) => onDeclaration(!!checked)}
          />
          I confirm that the information provided is accurate.
        </label>
      </section>
    </div>
  );
}

function SuccessScreen({ reference, applicationId }: { reference: string; applicationId: string }) {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col items-center justify-center px-4 text-center">
      <span className="flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary animate-success">
        <Check className="size-10" aria-hidden />
      </span>
      <h1 className="mt-8 font-display text-4xl">Application submitted</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Your investment application has been successfully submitted and is now under review.
      </p>
      <div className="mt-8 w-full rounded-lg border border-border bg-card p-5">
        <p className="eyebrow text-muted-foreground">Application reference</p>
        <p className="mt-2 font-display text-3xl">{reference}</p>
        <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-primary">Submitted</p>
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link to="/applications/$appId" params={{ appId: applicationId }}>
            View application
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/dashboard">Return to dashboard</Link>
        </Button>
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Save className="size-3.5" aria-hidden /> Download your PDF from the application page.
      </p>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { streamText, tool, stepCountIs } from "ai";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider, KAIVRA_CHAT_MODEL } from "@/lib/ai-gateway.server";
import { LOVABLE_ORIGIN, isLovableOrigin } from "@/lib/origin-fallback";


/**
 * KAIVRA AI Assist.
 *
 * Public endpoint (unauthenticated visitors get general guidance), but every
 * piece of investor data is read through a Supabase client that carries the
 * caller's own bearer token, so RLS decides what the assistant can see. The
 * service-role key is never used here and the AI never receives raw table
 * dumps — only the narrow tool results below.
 */

const BodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
  context: z
    .object({
      route: z.string().max(200).optional(),
      step: z.string().max(60).optional(),
      applicationReference: z.string().max(60).optional(),
      projectName: z.string().max(200).optional(),
      propertyName: z.string().max(200).optional(),
      status: z.string().max(60).optional(),
    })
    .optional(),
});

function env(...names: string[]): string | undefined {
  for (const name of names) {
    const runtime =
      typeof process !== "undefined" && process.env ? process.env[name] : undefined;
    if (runtime) return runtime;
    const inlined = (import.meta.env as Record<string, string | undefined>)[name];
    if (inlined) return inlined;
  }
  return undefined;
}

function supabaseFor(token?: string) {
  // Self-hosted (GitHub -> Cloudflare) builds only carry the VITE_* variables.
  const url = env("SUPABASE_URL", "VITE_SUPABASE_URL")!;
  const key = env("SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY")!;
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        if (token) headers.set("Authorization", `Bearer ${token}`);
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

const SYSTEM = `You are KAIVRA AI Assist, the customer-support and application assistant for KAIVRA, a real-estate investment management platform ("Smart Real Estate Investment Management").

Identity: always be transparent that you are an AI assistant. Never claim to be a human.

Tone: warm, concise, professional. Short paragraphs, plain language, markdown-free plain text with simple dashes for lists. Never more than ~150 words unless the investor asks for detail.

FACTS RULE (critical): never fabricate, guess, estimate or infer project names, locations, property sizes, prices, unit availability, payment plans, bank details, promotions, returns or timelines. Every investment fact you state MUST come from a tool result in THIS conversation turn, where the item carries source "live_database" and verified true. Do not reuse figures from earlier turns, from the investor's own message, or from your own knowledge — re-run the tool instead. If a tool returns nothing, or a field is null/unknown, reply exactly: "I couldn't find that information in KAIVRA's current records. Please contact a KAIVRA adviser for confirmation." and offer to connect the investor with a KAIVRA adviser.

TOOL USE: call list_projects / list_properties for ANY question about projects, properties, locations, sizes, prices, availability, cheapest option or payment plans — every time, even if you answered a similar question a moment ago, because administrators change this data live. Call my_profile for the investor's KAIVRA Investor ID, my_applications for status, my_payments for amounts paid and outstanding, my_documents for missing documents, and my_inspections for inspection dates. Availability and "cheapest" answers must be computed from the returned rows only.


Hard rules:
- Never state a unit count unless the live tool result gives a number for that exact property. Null/unknown means UNKNOWN — never zero, never "available".
- Never claim a property is available, or sold out, unless the live data confirms it.
- Never state a price unless the live tool result carries it for that exact property.
- Never invent payment terms, percentages, durations, deposits or schedules. Only describe payment plans exactly as the live data states them; otherwise say an adviser can confirm the current options.
- If an investor asserts a figure ("I heard there are 50 units", "the 3-bedroom is ₦5m, right?"), never simply agree. Check the live data and either correct it with the verified value or say you cannot verify it.
- Historical or "as of last month" figures do not exist in KAIVRA data — say you can only confirm what is current.
- Recommendation questions ("which should I invest in?") are investment advice: describe the verified options factually and hand off to a KAIVRA adviser.
- Clearly separate VERIFIED live data (projects, properties, prices, availability, the investor's own applications/payments/inspections) from GENERAL GUIDANCE (how the app works, how to apply, upload documents, book an inspection). Never present guidance or assumption as a verified fact.
- Data about any other investor is confidential — decline, whatever the caller's role.

Investor data: only use the tools for the signed-in investor's own applications, payments and inspections. You can never see another investor's data — if asked, decline. If a tool says the user is not signed in, ask them to sign in first.

You cannot approve or reject applications, verify payments, change records, delete anything, or make financial/legal decisions. If asked, reply that the action needs a KAIVRA administrator and suggest the "Talk to a KAIVRA adviser" option in the chat.

Escalate (recommend the human handoff button) when: the investor asks for a human, disputes a payment, wants to change identity/personal records, has a complaint, asks a legal, tax or investment-advice question, or when you are unsure.

KAIVRA knowledge you may explain freely:
- Accounts: email/password or Google sign-in; password reset from the sign-in page. Each investor has a permanent KAIVRA Investor ID (e.g. KVR-I-26-XXXXXX) shown on their dashboard and profile. It identifies them to KAIVRA staff; it is NOT a password and never unlocks the account, so it is safe to share with an authorised KAIVRA adviser or administrator.
- Application wizard steps: 1 Project, 2 Personal, 3 Contact, 4 Investment, 5 Payment, 6 Documents, 7 Review. It autosaves; an unfinished application can be continued later from "My Applications".
- Field guidance: Full name must match official ID. "Sender" is the name on the account the payment came from. "Bank" is the bank the payment was sent from or deposited into. "Initial deposit" is the amount already paid. "Proof of payment" is a clear bank transfer receipt or deposit slip. A passport photograph and a signature are required; a valid ID and proof of payment are recommended.
- Payments: investors upload proof of payment; KAIVRA staff verify it. Verified payments count towards the amount paid; the outstanding balance is the total investment value minus verified payments.
- Inspections: an investor requests a site inspection with a date and time; staff confirm it and the investor receives a notification and a KVR-S reference.
- Statuses: Draft (still editable), Submitted (received), Under Review (staff checking), Payment Verification (payment being confirmed), Approved (accepted), Requires Correction (something must be fixed and resubmitted), Rejected (not accepted).
- References: applications KVR-A-…, payments KVR-P-…, inspections KVR-S-…, support requests KVR-SUP-….`;

async function handler({ request }: { request: Request }) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return new Response("Invalid request", { status: 400 });
  }

  const apiKey = env("LOVABLE_API_KEY", "AI_GATEWAY_API_KEY");
  const supabaseConfigured =
    !!env("SUPABASE_URL", "VITE_SUPABASE_URL") &&
    !!env("SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY");

  // Self-hosted deployments (custom domain on Cloudflare) do not carry the
  // Lovable-managed AI key. Relay the request to the Lovable-hosted origin of
  // the same app instead of failing with "not configured".
  if ((!apiKey || !supabaseConfigured) && !isLovableOrigin(request)) {
    const auth = request.headers.get("authorization");
    const relayed = await fetch(`${LOVABLE_ORIGIN}/api/public/ai-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { authorization: auth } : {}),
      },
      body: JSON.stringify(body),
    });
    return new Response(relayed.body, {
      status: relayed.status,
      headers: {
        "Content-Type": relayed.headers.get("content-type") ?? "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  }

  if (!apiKey) {
    console.error("[ai-chat] LOVABLE_API_KEY is not set on this deployment.");
    return new Response("KAIVRA AI Assist is not configured.", { status: 503 });
  }
  if (!supabaseConfigured) {
    console.error("[ai-chat] Supabase environment is not configured on this deployment.");
    return new Response("KAIVRA AI Assist is not configured.", { status: 503 });
  }


  const authHeader = request.headers.get("authorization") ?? "";
  const token =
    authHeader.startsWith("Bearer ") && authHeader.slice(7).split(".").length === 3
      ? authHeader.slice(7)
      : undefined;

  const supabase = supabaseFor(token);

  const { data: settings } = await supabase
    .from("ai_settings")
    .select("enabled")
    .maybeSingle();
  if (settings && settings.enabled === false) {
    return new Response("KAIVRA AI Assist is currently switched off.", { status: 503 });
  }

  let userId: string | null = null;
  if (token) {
    const { data } = await supabase.auth.getClaims(token);
    userId = (data?.claims?.sub as string | undefined) ?? null;
  }

  const gateway = createLovableAiGatewayProvider(apiKey);

  const requireUser = () =>
    userId ? null : { error: "The investor is not signed in. Ask them to sign in first." };

  const tools = {
    list_projects: tool({
      description:
        "List the real-estate projects KAIVRA currently offers, with location and description.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from("projects")
          .select("name, location, description, project_code, currency, payment_plans, updated_at")
          .eq("is_active", true)
          .order("created_at");
        if (error) return { source: "live_database", verified: false, projects: [] };
        return {
          source: "live_database",
          verified: true,
          retrieved_at: new Date().toISOString(),
          projects: (data ?? []).map((p) => ({
            ...p,
            payment_plans:
              Array.isArray(p.payment_plans) && p.payment_plans.length > 0
                ? p.payment_plans
                : "unknown — not configured in the database",
          })),
        };
      },
    }),
    list_properties: tool({
      description:
        "List the properties (type, size, price) for a KAIVRA project. Use when asked about sizes, plots, duplexes, cheapest option or prices. Optionally filter by a size term such as '400' or '4-bedroom'.",
      inputSchema: z.object({
        projectName: z.string().nullable(),
        sizeOrType: z.string().nullable().optional(),
      }),
      execute: async ({ projectName, sizeOrType }) => {

        let query = supabase
          .from("properties")
          .select(
            "name, property_type, size_label, unit_price, payment_plan, description, projects(name, location)",
          )
          .eq("is_active", true)
          .order("unit_price");
        if (projectName) {
          const { data: project } = await supabase
            .from("projects")
            .select("id")
            .ilike("name", `%${projectName}%`)
            .limit(1)
            .maybeSingle();
          if (project?.id) query = query.eq("project_id", project.id);
        }
        if (sizeOrType) {
          const term = sizeOrType.replace(/[%,]/g, " ").trim();
          if (term) {
            query = query.or(
              `size_label.ilike.%${term}%,property_type.ilike.%${term}%,name.ilike.%${term}%`,
            );
          }
        }
        const { data, error } = await query.limit(30);
        if (error) return { source: "live_database", verified: false, properties: [] };

        return {
          source: "live_database",
          verified: true,
          currency: "NGN",
          retrieved_at: new Date().toISOString(),
          note: "Only state figures present below. A null/unknown field means UNKNOWN — never report it as zero, sold out or available.",
          properties: (data ?? []).map((p) => ({
            ...p,
            unit_price: p.unit_price ?? "unknown — no verified price on record",
            payment_plan: p.payment_plan || "unknown — not configured in the database",
          })),
        };
      },
    }),
    my_applications: tool({
      description:
        "The signed-in investor's own applications: reference, status, project, property and investment value.",
      inputSchema: z.object({}),
      execute: async () => {
        const denied = requireUser();
        if (denied) return denied;
        const { data } = await supabase
          .from("applications")
          .select(
            "reference, status, current_step, investment, submitted_at, created_at, projects(name), properties(name, size_label, unit_price)",
          )
          .eq("investor_id", userId!)
          .order("created_at", { ascending: false })
          .limit(10);
        return { source: "live_database", verified: true, applications: data ?? [] };
      },
    }),
    my_payments: tool({
      description:
        "The signed-in investor's own payment records and totals (paid vs pending vs outstanding).",
      inputSchema: z.object({}),
      execute: async () => {
        const denied = requireUser();
        if (denied) return denied;
        const { data: apps } = await supabase
          .from("applications")
          .select("id, reference, investment")
          .eq("investor_id", userId!);
        const ids = (apps ?? []).map((a) => a.id);
        if (ids.length === 0) return { payments: [], totals: null };
        const { data: payments } = await supabase
          .from("application_payments")
          .select("payment_reference, amount, status, method, paid_on, application_id")
          .in("application_id", ids)
          .order("created_at", { ascending: false })
          .limit(40);
        const invested = (apps ?? []).reduce(
          (sum, a) => sum + Number((a.investment as { total_value?: number })?.total_value ?? 0),
          0,
        );
        const verified = (payments ?? [])
          .filter((p) => p.status === "verified")
          .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
        const pending = (payments ?? [])
          .filter((p) => p.status === "pending")
          .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
        return {
          source: "live_database",
          verified: true,
          currency: "NGN",

          totals: { invested, verifiedPaid: verified, pending, outstanding: invested - verified },
          payments: (payments ?? []).map(({ application_id, ...rest }) => ({
            ...rest,
            application: (apps ?? []).find((a) => a.id === application_id)?.reference ?? null,
          })),
        };
      },
    }),
    my_inspections: tool({
      description: "The signed-in investor's own site inspection appointments and their status.",
      inputSchema: z.object({}),
      execute: async () => {
        const denied = requireUser();
        if (denied) return denied;
        const { data } = await supabase
          .from("inspection_appointments")
          .select("reference, status, scheduled_date, scheduled_time, notes, projects(name)")
          .eq("investor_id", userId!)
          .order("scheduled_date", { ascending: false })
          .limit(10);
        return { source: "live_database", verified: true, inspections: data ?? [] };
      },
    }),
    my_profile: tool({
      description:
        "The signed-in investor's own KAIVRA profile: permanent Investor ID (investor code), name, email and phone. Use for 'what is my investor ID?'.",
      inputSchema: z.object({}),
      execute: async () => {
        const denied = requireUser();
        if (denied) return denied;
        const { data } = await supabase
          .from("profiles")
          .select("full_name, email, phone, investor_code")
          .eq("id", userId!)
          .maybeSingle();
        if (!data) return { source: "live_database", verified: false, profile: null };
        return { source: "live_database", verified: true, profile: data };
      },
    }),
    my_documents: tool({
      description:
        "Documents already uploaded on the signed-in investor's applications, and which required documents are still missing (passport photograph and signature are required).",
      inputSchema: z.object({}),
      execute: async () => {
        const denied = requireUser();
        if (denied) return denied;
        const { data: apps } = await supabase
          .from("applications")
          .select("id, reference, status")
          .eq("investor_id", userId!)
          .order("created_at", { ascending: false })
          .limit(10);
        const ids = (apps ?? []).map((a) => a.id);
        if (ids.length === 0)
          return { source: "live_database", verified: true, applications: [] };
        const { data: docs } = await supabase
          .from("application_documents")
          .select("application_id, kind, label, file_name, created_at")
          .in("application_id", ids);
        return {
          source: "live_database",
          verified: true,
          required_kinds: ["passport", "signature"],
          recommended_kinds: ["proof_of_payment", "additional"],
          applications: (apps ?? []).map((a) => {
            const mine = (docs ?? []).filter((d) => d.application_id === a.id);
            const kinds = new Set(mine.map((d) => d.kind));
            return {
              reference: a.reference,
              status: a.status,
              uploaded: mine.map(({ application_id: _ignored, ...rest }) => rest),
              missing_required: ["passport", "signature"].filter((k) => !kinds.has(k as never)),
            };
          }),
        };
      },
    }),
  };


  const ctx = body.context;
  const contextLine = ctx
    ? `Current app context (safe, minimal): page ${ctx.route ?? "unknown"}${
        ctx.step ? `, wizard step "${ctx.step}"` : ""
      }${ctx.projectName ? `, project "${ctx.projectName}"` : ""}${
        ctx.propertyName ? `, property "${ctx.propertyName}"` : ""
      }${ctx.status ? `, application status "${ctx.status}"` : ""}${
        ctx.applicationReference ? `, application ${ctx.applicationReference}` : ""
      }.`
    : "";

  const result = streamText({
    model: gateway(KAIVRA_CHAT_MODEL),
    system: `${SYSTEM}\n\nThe investor is ${userId ? "signed in" : "NOT signed in (public visitor)"}.\n${contextLine}`,
    messages: body.messages,
    tools,
    stopWhen: stepCountIs(6),
  });

  return result.toTextStreamResponse({
    headers: { "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/ai-chat")({
  server: { handlers: { POST: handler } },
});

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
import { Bot, Headset, Loader2, MessageSquarePlus, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/hooks/useAuth";
import { closeAiAssist, openAiAssist, useAiAssistState } from "@/lib/ai-assist";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_STATUS_LABEL,
  createSupportTicket,
  type SupportStatus,
} from "@/lib/support.functions";
import { cn } from "@/lib/utils";

type ChatMessage = { role: "user" | "assistant"; content: string };

const PUBLIC_ACTIONS = [
  "How do I apply?",
  "Show available projects",
  "What documents do I need?",
  "How do I make a payment?",
];

const PRIVATE_ACTIONS = [
  "Help me complete my application",
  "Check my application status",
  "View my payment history",
  "How much do I still owe?",
  "Schedule an inspection",
];

const WELCOME =
  "Hi, I'm KAIVRA AI Assist. I can help you navigate KAIVRA, understand your application and answer questions using verified KAIVRA information. I'm an AI assistant — I can connect you with a KAIVRA team member at any time.";

export function AiAssist() {
  const { open, context } = useAiAssistState();
  const { user } = useSession();
  const routerState = useRouterState({ select: (s) => s.location.pathname });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [view, setView] = useState<"chat" | "handoff">("chat");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: settings } = useQuery({
    queryKey: ["ai-settings"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_settings")
        .select("enabled, welcome_message, escalation_enabled")
        .maybeSingle();
      return data;
    },
  });

  const quickActions = useMemo(
    () => (user ? [...PRIVATE_ACTIONS, ...PUBLIC_ACTIONS.slice(0, 2)] : PUBLIC_ACTIONS),
    [user],
  );

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, messages, draft]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || streaming) return;
      setInput("");
      const next: ChatMessage[] = [...messages, { role: "user", content: question }];
      setMessages(next);
      setStreaming(true);
      setDraft("");

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const res = await fetch("/api/public/ai-chat", {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            messages: next.slice(-20),
            context: { ...(context ?? {}), route: context?.route ?? routerState },
          }),
        });
        if (!res.ok || !res.body) throw new Error(await res.text());

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          acc += decoder.decode(chunk.value, { stream: true });
          setDraft(acc);
        }
        setMessages([...next, { role: "assistant", content: acc.trim() || "…" }]);
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
        setMessages([
          ...next,
          {
            role: "assistant",
            content:
              "KAIVRA AI Assist is temporarily unavailable. You can still reach a KAIVRA team member using the button below — everything else in the app keeps working normally.",
          },
        ]);
      } finally {
        setDraft("");
        setStreaming(false);
      }
    },
    [context, messages, routerState, streaming],
  );

  const disabled = settings?.enabled === false;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => openAiAssist({ context: { route: routerState } })}
        aria-label="Open KAIVRA AI Assist"
        className="no-print fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
      >
        <Sparkles className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-end sm:p-4">
      <button
        type="button"
        aria-label="Close assistant"
        onClick={closeAiAssist}
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px] sm:bg-transparent sm:backdrop-blur-0"
      />
      <div className="relative flex h-full w-full max-w-full flex-col overflow-hidden border border-border bg-background shadow-2xl duration-200 animate-in slide-in-from-bottom-4 sm:h-[min(38rem,calc(100vh-2rem))] sm:w-[26rem] sm:rounded-xl">
        <header className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Bot className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">KAIVRA AI Assist</p>
            <p className="truncate text-xs text-muted-foreground">Always here to help</p>
          </div>
          <Button variant="ghost" size="icon" onClick={closeAiAssist} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </header>

        {view === "handoff" ? (
          <HandoffPanel onBack={() => setView("chat")} context={context} />
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <Bubble role="assistant" content={settings?.welcome_message || WELCOME} />
              {disabled ? (
                <Bubble
                  role="assistant"
                  content="KAIVRA AI Assist is currently switched off by the KAIVRA team. You can still contact an adviser or administrator below."
                />
              ) : null}
              {messages.map((m, i) => (
                <Bubble key={i} role={m.role} content={m.content} />
              ))}
              {draft ? <Bubble role="assistant" content={draft} /> : null}
              {streaming && !draft ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> KAIVRA AI Assist is typing…
                </div>
              ) : null}

              {messages.length === 0 && !disabled ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {quickActions.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => void send(q)}
                      className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="flex items-end gap-2">
                <Input
                  value={input}
                  disabled={disabled}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                  placeholder={disabled ? "Assistant unavailable" : "Ask about KAIVRA…"}
                  aria-label="Message KAIVRA AI Assist"
                />
                <Button
                  size="icon"
                  onClick={() => void send(input)}
                  disabled={disabled || streaming || !input.trim()}
                  aria-label="Send message"
                >
                  {streaming ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {settings?.escalation_enabled === false ? null : (
                <button
                  type="button"
                  onClick={() => setView("handoff")}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <Headset className="h-3.5 w-3.5" /> Talk to a KAIVRA adviser
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Bubble({ role, content }: ChatMessage) {
  return (
    <div className={cn("flex", role === "user" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm leading-relaxed",
          role === "user"
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm border border-border bg-card text-foreground",
        )}
      >
        {content}
      </div>
    </div>
  );
}

/** Human escalation: live agent chat, WhatsApp, or a tracked support request. */
function HandoffPanel({
  onBack,
  context,
}: {
  onBack: () => void;
  context: ReturnType<typeof useAiAssistState>["context"];
}) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const create = useServerFn(createSupportTicket);
  const startLive = useServerFn(startLiveSupportChat);
  const settings = useSupportSettings();
  const profile = useProfile(user?.id);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<string>(SUPPORT_CATEGORIES[0]);
  const [priority, setPriority] = useState("normal");
  const [message, setMessage] = useState("");
  const [liveTicketId, setLiveTicketId] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const [mode, setMode] = useState<"choose" | "live" | "ticket">("choose");

  const tickets = useQuery({
    queryKey: ["support-tickets", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("id, reference, subject, status, category, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const whatsappHref = buildWhatsAppLink(settings.whatsapp_number, {
    name: profile.data?.full_name,
    investorCode: profile.data?.investor_code,
    reference: context?.applicationReference ?? null,
    page: context?.route ?? null,
    topic: context?.projectName ?? null,
  });

  const openLive = useMutation({
    mutationFn: async () =>
      startLive({
        data: {
          topic: context?.projectName
            ? `Live chat · ${context.projectName}`
            : "Live chat with a KAIVRA agent",
          message: liveMessage.trim(),
          category,
        },
      }),
    onSuccess: (ticket) => {
      setLiveTicketId(ticket.id);
      setLiveMessage("");
      setMode("live");
      void queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
    },
    onError: () => toast.error("The live chat could not be started. Please try again."),
  });

  const submit = useMutation({
    mutationFn: async () =>
      create({
        data: {
          subject: subject.trim(),
          category,
          message: message.trim(),
          priority: priority as "low" | "normal" | "high" | "urgent",
        },
      }),
    onSuccess: (ticket) => {
      toast.success(`Request created · ${ticket.reference ?? ""}`.trim());
      setSubject("");
      setMessage("");
      setMode("choose");
      void queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
    },
    onError: () => toast.error("Your support request could not be created. Please try again."),
  });

  if (mode === "live" && liveTicketId && user) {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-2 pb-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">KAIVRA agent</p>
            <p className="truncate text-xs text-muted-foreground">
              A team member will reply here · {settings.support_hours}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setMode("choose")}>
            Back
          </Button>
        </div>
        <SupportThread
          ticketId={liveTicketId}
          viewerId={user.id}
          placeholder="Message a KAIVRA agent…"
          emptyLabel="Your conversation starts here."
        />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div>
        <p className="eyebrow text-primary">Connect with KAIVRA</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Chat with a KAIVRA agent in the app, continue on WhatsApp, or raise a tracked request.
          Support hours: {settings.support_hours}.
        </p>
      </div>

      {user ? (
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Headset className="h-4 w-4 text-primary" /> Chat with an agent
          </p>
          <Textarea
            rows={2}
            value={liveMessage}
            onChange={(e) => setLiveMessage(e.target.value)}
            placeholder="Briefly, what do you need help with?"
            aria-label="Message to a KAIVRA agent"
          />
          <Button
            className="w-full"
            disabled={openLive.isPending || liveMessage.trim().length < 3}
            onClick={() => openLive.mutate()}
          >
            {openLive.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Start live chat
          </Button>
        </div>
      ) : (
        <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Sign in to chat with a KAIVRA agent, or reach us on WhatsApp below.
        </p>
      )}

      <div className="grid gap-2">
        {settings.whatsapp_enabled ? (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm font-medium text-foreground hover:bg-primary/10"
          >
            <MessageCircle className="h-4 w-4 text-primary" /> Continue on WhatsApp
          </a>
        ) : null}
        <a
          href={`tel:${settings.support_phone.replace(/\s/g, "")}`}
          className="rounded-md border border-border bg-card px-3 py-2 text-sm hover:border-primary/40"
        >
          Call KAIVRA · {settings.support_phone}
        </a>
        <a
          href={`mailto:${settings.support_email}`}
          className="rounded-md border border-border bg-card px-3 py-2 text-sm hover:border-primary/40"
        >
          Email · {settings.support_email}
        </a>
      </div>

      {user ? (
        mode === "ticket" ? (
          <div className="space-y-3 rounded-md border border-border p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <MessageSquarePlus className="h-4 w-4 text-primary" /> Create a support request
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="ai-subject">Subject</Label>
              <Input
                id="ai-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief summary"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["low", "normal", "high", "urgent"].map((p) => (
                      <SelectItem key={p} value={p} className="capitalize">
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-message">Message</Label>
              <Textarea
                id="ai-message"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us what you need help with"
              />
            </div>
            <Button
              className="w-full"
              disabled={submit.isPending || subject.trim().length < 3 || message.trim().length < 5}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send to KAIVRA
            </Button>
          </div>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setMode("ticket")}>
            <MessageSquarePlus className="mr-2 h-4 w-4" /> Raise a tracked request
          </Button>
        )
      ) : null}

      {tickets.data && tickets.data.length > 0 ? (
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">My requests</p>
          {tickets.data.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setLiveTicketId(t.id);
                setMode("live");
              }}
              className="block w-full rounded-md border border-transparent px-1 py-1 text-left text-xs hover:border-border hover:bg-muted/40"
            >
              <span className="block font-medium text-foreground">{t.subject}</span>
              <span className="block text-muted-foreground">
                {t.reference} ·{" "}
                {SUPPORT_STATUS_LABEL[(t.status as SupportStatus) ?? "open"] ?? t.status}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <Button variant="ghost" className="w-full" onClick={onBack}>
        Back to KAIVRA AI Assist
      </Button>
    </div>
  );
}


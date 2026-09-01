import { useSyncExternalStore } from "react";

export interface AiAssistContext {
  route?: string;
  step?: string;
  applicationReference?: string;
  projectName?: string;
  propertyName?: string;
  status?: string;
}

type State = { open: boolean; context: AiAssistContext | null; prompt: string | null };

let state: State = { open: false, context: null, prompt: null };
const listeners = new Set<() => void>();

function emit(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

export function openAiAssist(options?: { context?: AiAssistContext; prompt?: string }) {
  emit({
    open: true,
    context: options?.context ?? state.context,
    prompt: options?.prompt ?? null,
  });
}

export function closeAiAssist() {
  emit({ ...state, open: false, prompt: null });
}

export function consumeAiAssistPrompt() {
  if (state.prompt) emit({ ...state, prompt: null });
}

const serverSnapshot: State = { open: false, context: null, prompt: null };

export function useAiAssistState() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => serverSnapshot,
  );
}

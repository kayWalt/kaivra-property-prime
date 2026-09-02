/**
 * Short, tasteful two-tone chime played when a new notification arrives.
 *
 * Synthesised with the Web Audio API so no audio asset has to be shipped or
 * fetched. Browsers block audio until the user has interacted with the page,
 * so every failure is swallowed silently — a missing sound must never break
 * the notification itself.
 */
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

function tone(audio: AudioContext, frequency: number, startAt: number, duration: number) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.18, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

/** Plays the notification chime. Silent no-op when audio is unavailable. */
export function playNotificationSound(): void {
  try {
    const audio = context();
    if (!audio) return;
    if (audio.state === "suspended") void audio.resume();
    const now = audio.currentTime + 0.01;
    tone(audio, 880, now, 0.16);
    tone(audio, 1318.5, now + 0.14, 0.22);
  } catch {
    /* audio is best-effort */
  }
}

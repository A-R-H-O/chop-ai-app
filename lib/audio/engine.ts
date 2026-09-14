/**
 * Sample playback for the samples screen.
 *
 * Web Audio rather than HTMLAudioElement, because an audio element cannot
 * retrigger fast enough to be played like a pad: calling play() again
 * while it is already playing either restarts it or is ignored, so rapid
 * hits stutter instead of overlapping. A fresh AudioBufferSourceNode per
 * trigger is the only way to get two hits ringing at once, which is what
 * a sampler does.
 *
 * Buffers are decoded once and kept. Decoding is the expensive part, and
 * a producer hitting the same key twenty times should pay for it once.
 */

export type TriggerSource = "keyboard" | "click";

export interface EngineEvents {
  onPlay?: (sampleId: string, trigger: TriggerSource) => void;
}

export class SampleEngine {
  private context: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer>>();
  private active = new Map<string, AudioBufferSourceNode[]>();
  /** When each sample's newest voice started, on the context clock. */
  private startedAt = new Map<string, number>();
  private events: EngineEvents;

  constructor(events: EngineEvents = {}) {
    this.events = events;
  }

  /**
   * Browsers start an AudioContext suspended until a user gesture, so
   * this must be called from inside a real click or keydown handler.
   *
   * latencyHint "interactive" asks for the smallest buffer the device
   * will give us. The default is "balanced", which trades tens of
   * milliseconds of latency for power, and tens of milliseconds is the
   * difference between a pad and a lag.
   */
  private ensureContext(): AudioContext {
    if (!this.context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.context = new Ctor({ latencyHint: "interactive" });
    }
    if (this.context.state === "suspended") {
      void this.context.resume();
    }
    return this.context;
  }

  /**
   * Bring the context up before the first pad hit.
   *
   * The context is created suspended during preload, and resume() is
   * async, so without this the very first key press pays for the resume
   * and lands noticeably late. Call it from any earlier gesture on the
   * page and every hit including the first is immediate.
   */
  warm(): void {
    this.ensureContext();
  }

  /** How far into the sample its newest voice is, 0 to 1, or null. */
  progress(sampleId: string): number | null {
    const voices = this.active.get(sampleId);
    const started = this.startedAt.get(sampleId);
    const buffer = this.buffers.get(sampleId);
    if (!voices?.length || started === undefined || !buffer || !this.context) {
      return null;
    }

    const elapsed = this.context.currentTime - started;
    if (elapsed < 0) return 0;
    return Math.min(1, elapsed / buffer.duration);
  }

  /** Decode once; concurrent callers share the same in-flight promise. */
  async load(sampleId: string, url: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(sampleId);
    if (cached) return cached;

    const inFlight = this.loading.get(sampleId);
    if (inFlight) return inFlight;

    const context = this.ensureContext();
    const promise = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`could not load sample: ${r.status}`);
        return r.arrayBuffer();
      })
      .then((bytes) => context.decodeAudioData(bytes))
      .then((buffer) => {
        this.buffers.set(sampleId, buffer);
        this.loading.delete(sampleId);
        return buffer;
      })
      .catch((error) => {
        this.loading.delete(sampleId);
        throw error;
      });

    this.loading.set(sampleId, promise);
    return promise;
  }

  isLoaded(sampleId: string): boolean {
    return this.buffers.has(sampleId);
  }

  /**
   * Fire a sample. Overlaps by design: a new source node every time, so
   * hitting a key three times fast rings three voices rather than
   * restarting one.
   */
  play(sampleId: string, trigger: TriggerSource = "click"): boolean {
    const buffer = this.buffers.get(sampleId);
    if (!buffer) return false;

    const context = this.ensureContext();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);

    const voices = this.active.get(sampleId) ?? [];
    voices.push(source);
    this.active.set(sampleId, voices);

    source.onended = () => {
      const current = this.active.get(sampleId);
      if (!current) return;
      const index = current.indexOf(source);
      if (index !== -1) current.splice(index, 1);
      if (current.length === 0) this.startedAt.delete(sampleId);
    };

    source.start();
    this.startedAt.set(sampleId, context.currentTime);
    this.events.onPlay?.(sampleId, trigger);
    return true;
  }

  /** Stop every voice of one sample. */
  stop(sampleId: string): void {
    for (const source of this.active.get(sampleId) ?? []) {
      try {
        source.stop();
      } catch {
        // Already ended; stop() on a finished node throws.
      }
    }
    this.active.set(sampleId, []);
    this.startedAt.delete(sampleId);
  }

  stopAll(): void {
    for (const id of this.active.keys()) this.stop(id);
  }

  isPlaying(sampleId: string): boolean {
    return (this.active.get(sampleId) ?? []).length > 0;
  }

  dispose(): void {
    this.stopAll();
    this.buffers.clear();
    this.loading.clear();
    this.startedAt.clear();
    void this.context?.close();
    this.context = null;
  }
}

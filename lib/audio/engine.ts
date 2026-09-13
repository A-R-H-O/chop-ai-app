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
  private events: EngineEvents;

  constructor(events: EngineEvents = {}) {
    this.events = events;
  }

  /**
   * Browsers start an AudioContext suspended until a user gesture, so
   * this must be called from inside a real click or keydown handler.
   */
  private ensureContext(): AudioContext {
    if (!this.context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.context = new Ctor();
    }
    if (this.context.state === "suspended") {
      void this.context.resume();
    }
    return this.context;
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
    };

    source.start();
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
    void this.context?.close();
    this.context = null;
  }
}

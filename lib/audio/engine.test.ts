import { describe, expect, it, vi, beforeEach } from "vitest";
import { SampleEngine } from "./engine";
import { shouldTrigger, indexForKey, keyForIndex, SAMPLE_KEYS } from "./keys";

/** Minimal AudioContext stand-in: jsdom has no Web Audio. */
function stubAudio() {
  const started: unknown[] = [];

  class FakeSource {
    buffer: unknown = null;
    onended: (() => void) | null = null;
    connect = vi.fn();
    start = vi.fn(() => started.push(this));
    stop = vi.fn(() => this.onended?.());
  }

  const context = {
    state: "running",
    // Advanced by hand in the tests to stand in for the audio clock.
    currentTime: 0,
    destination: {},
    createBufferSource: vi.fn(() => new FakeSource()),
    decodeAudioData: vi.fn(async () => ({ duration: 1 })),
    resume: vi.fn(),
    close: vi.fn(),
  };

  // A regular function, not an arrow: arrow functions cannot be called
  // with `new`, and the engine constructs its AudioContext.
  vi.stubGlobal("AudioContext", function AudioContextStub() {
    return context;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })),
  );

  return { context, started };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("SampleEngine", () => {
  it("decodes a sample exactly once however many times it is loaded", async () => {
    const { context } = stubAudio();
    const engine = new SampleEngine();

    await engine.load("s1", "/a.wav");
    await engine.load("s1", "/a.wav");
    await engine.load("s1", "/a.wav");

    expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
  });

  it("shares one in-flight decode between concurrent callers", async () => {
    const { context } = stubAudio();
    const engine = new SampleEngine();

    await Promise.all([
      engine.load("s1", "/a.wav"),
      engine.load("s1", "/a.wav"),
      engine.load("s1", "/a.wav"),
    ]);

    expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
  });

  it("creates a new source node per trigger so hits overlap", async () => {
    const { context } = stubAudio();
    const engine = new SampleEngine();
    await engine.load("s1", "/a.wav");

    engine.play("s1");
    engine.play("s1");
    engine.play("s1");

    // Three voices, not one restarted three times. This is the whole
    // reason for Web Audio over an audio element.
    expect(context.createBufferSource).toHaveBeenCalledTimes(3);
  });

  it("reports playing while voices are ringing", async () => {
    stubAudio();
    const engine = new SampleEngine();
    await engine.load("s1", "/a.wav");

    expect(engine.isPlaying("s1")).toBe(false);
    engine.play("s1");
    expect(engine.isPlaying("s1")).toBe(true);
  });

  it("stops every voice of a sample", async () => {
    stubAudio();
    const engine = new SampleEngine();
    await engine.load("s1", "/a.wav");

    engine.play("s1");
    engine.play("s1");
    engine.stop("s1");

    expect(engine.isPlaying("s1")).toBe(false);
  });

  it("refuses to play a sample that has not loaded", () => {
    stubAudio();
    const engine = new SampleEngine();
    expect(engine.play("never-loaded")).toBe(false);
  });

  it("reports the trigger source so analytics can tell keys from clicks", async () => {
    stubAudio();
    const onPlay = vi.fn();
    const engine = new SampleEngine({ onPlay });
    await engine.load("s1", "/a.wav");

    engine.play("s1", "keyboard");
    expect(onPlay).toHaveBeenCalledWith("s1", "keyboard");
  });

  it("surfaces a failed fetch rather than silently doing nothing", async () => {
    stubAudio();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404 })),
    );
    const engine = new SampleEngine();
    await expect(engine.load("s1", "/missing.wav")).rejects.toThrow(/404/);
  });

  it("retries cleanly after a failed load", async () => {
    stubAudio();
    const failing = vi.fn(async () => ({ ok: false, status: 500 }));
    vi.stubGlobal("fetch", failing);
    const engine = new SampleEngine();

    await expect(engine.load("s1", "/x.wav")).rejects.toThrow();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })),
    );
    await expect(engine.load("s1", "/x.wav")).resolves.toBeTruthy();
  });
});

describe("keyboard bindings", () => {
  it("covers the eight samples the pipeline can return", () => {
    expect(SAMPLE_KEYS).toHaveLength(8);
    expect(keyForIndex(0)).toBe("a");
    expect(keyForIndex(7)).toBe("k");
    expect(keyForIndex(8)).toBeNull();
  });

  it("maps a key back to its rank", () => {
    expect(indexForKey("d")).toBe(2);
    expect(indexForKey("D")).toBe(2);
    expect(indexForKey("z")).toBe(-1);
  });

  it("triggers on a bound key", () => {
    expect(shouldTrigger({ key: "a", repeat: false, target: null } as never)).toBe(
      true,
    );
  });

  it("ignores auto-repeat so a held key does not machine-gun", () => {
    expect(shouldTrigger({ key: "a", repeat: true, target: null } as never)).toBe(
      false,
    );
  });

  it("ignores keys typed into a text field", () => {
    const target = { tagName: "TEXTAREA", isContentEditable: false };
    expect(shouldTrigger({ key: "a", repeat: false, target } as never)).toBe(false);
  });

  it("ignores keys typed into an input", () => {
    const target = { tagName: "INPUT", isContentEditable: false };
    expect(shouldTrigger({ key: "a", repeat: false, target } as never)).toBe(false);
  });

  it("ignores shortcuts so cmd+a still selects all", () => {
    expect(
      shouldTrigger({
        key: "a",
        repeat: false,
        metaKey: true,
        target: null,
      } as never),
    ).toBe(false);
  });

  it("ignores unbound keys", () => {
    expect(shouldTrigger({ key: "q", repeat: false, target: null } as never)).toBe(
      false,
    );
  });
});

describe("SampleEngine playhead", () => {
  it("reports nothing for a sample that is not playing", async () => {
    stubAudio();
    const engine = new SampleEngine();
    await engine.load("s1", "/a.wav");

    expect(engine.progress("s1")).toBeNull();
  });

  it("tracks position against the audio clock, not a timer", async () => {
    const { context } = stubAudio();
    const engine = new SampleEngine();
    await engine.load("s1", "/a.wav");

    engine.play("s1");
    expect(engine.progress("s1")).toBe(0);

    // The stub buffer is one second long.
    context.currentTime = 0.25;
    expect(engine.progress("s1")).toBeCloseTo(0.25);

    context.currentTime = 0.9;
    expect(engine.progress("s1")).toBeCloseTo(0.9);
  });

  it("clamps at the end rather than running past one", async () => {
    const { context } = stubAudio();
    const engine = new SampleEngine();
    await engine.load("s1", "/a.wav");

    engine.play("s1");
    context.currentTime = 5;

    expect(engine.progress("s1")).toBe(1);
  });

  it("restarts the playhead when a pad is retriggered", async () => {
    const { context } = stubAudio();
    const engine = new SampleEngine();
    await engine.load("s1", "/a.wav");

    engine.play("s1");
    context.currentTime = 0.8;
    expect(engine.progress("s1")).toBeCloseTo(0.8);

    // Hitting the pad again is a new hit: the position follows the newest
    // voice, so the playhead jumps back to the top.
    engine.play("s1");
    expect(engine.progress("s1")).toBe(0);
  });

  it("forgets the position once the sample is stopped", async () => {
    stubAudio();
    const engine = new SampleEngine();
    await engine.load("s1", "/a.wav");

    engine.play("s1");
    engine.stop("s1");

    expect(engine.progress("s1")).toBeNull();
  });

  it("warms the context before the first hit so resume is already paid", () => {
    const { context } = stubAudio();
    context.state = "suspended";
    const engine = new SampleEngine();

    engine.warm();

    expect(context.resume).toHaveBeenCalled();
  });
});

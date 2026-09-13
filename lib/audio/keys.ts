/**
 * Keyboard bindings for the samples screen.
 *
 * Eight keys along the home row, assigned in rank order. The handoff
 * shows three because its mock has three samples; the pipeline returns up
 * to eight, so the row covers all of them.
 */
export const SAMPLE_KEYS = ["a", "s", "d", "f", "g", "h", "j", "k"] as const;

export function keyForIndex(index: number): string | null {
  return SAMPLE_KEYS[index] ?? null;
}

/**
 * True when a keydown should trigger a sample.
 *
 * Two exclusions that matter. Auto-repeat, because holding a key down
 * would otherwise machine-gun the sample. And any event originating in a
 * text field, because otherwise typing "add a snare" into the retry box
 * would play four samples.
 */
export function shouldTrigger(event: KeyboardEvent): boolean {
  if (event.repeat) return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;

  const target = event.target as HTMLElement | null;
  if (target) {
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false;
    if (target.isContentEditable) return false;
  }

  return SAMPLE_KEYS.includes(event.key.toLowerCase() as (typeof SAMPLE_KEYS)[number]);
}

export function indexForKey(key: string): number {
  return SAMPLE_KEYS.indexOf(key.toLowerCase() as (typeof SAMPLE_KEYS)[number]);
}

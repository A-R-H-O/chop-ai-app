/**
 * The eighth-note glyph beside the credit balance. Traced from the inline
 * svg in design/handoff-credits/README.md; the design system has no
 * music-note icon, so this is the canonical one.
 */
export function NoteGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="block shrink-0 text-chop-accent"
    >
      <path
        d="M6.2 12V3.2l6.3-1.7v2.2L6.2 5.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <ellipse cx="3.8" cy="12.2" rx="2.5" ry="2.1" fill="currentColor" />
    </svg>
  );
}

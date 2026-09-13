import Image from "next/image";

/**
 * A heading with one of the handoff's hand-drawn underlines behind it.
 * The underline is an asset rather than a border, and is inverted because
 * the source art is dark-on-light.
 */
export function UnderlinedHeading({
  children,
  underline = "underline-4",
  className = "",
  underlineClassName = "left-[24%] bottom-[-2px] w-[52%]",
}: {
  children: React.ReactNode;
  underline?: "underline-4" | "underline-10";
  className?: string;
  underlineClassName?: string;
}) {
  return (
    <div className="relative w-fit">
      <h1
        className={`m-0 text-center font-display font-bold tracking-[-0.02em] text-chop-ink ${className}`}
      >
        {children}
      </h1>
      <Image
        src={`/illustrations/${underline}.svg`}
        alt=""
        aria-hidden="true"
        width={340}
        height={16}
        className={`absolute block h-auto opacity-90 invert ${underlineClassName}`}
      />
    </div>
  );
}

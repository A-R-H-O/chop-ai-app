import { AppHeader } from "@/components/chop/app-header";

export default function Home() {
  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 pb-16">
        <h1 className="font-display text-4xl font-bold tracking-[-0.02em] text-chop-ink md:text-6xl">
          what&apos;s the sample?
        </h1>
        <p className="font-sans text-lg text-chop-muted">
          name the song, the emotion, and the chops you want
        </p>
      </main>
    </>
  );
}

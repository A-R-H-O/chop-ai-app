# chop.ai

Chop a song into samples that understand what the song is doing.

Paste a YouTube link or upload audio, describe the song and the emotion and the chops you want, and get back a small set of loops and one-shots you can play from your keyboard and export as a zip of 24-bit wavs for GarageBand, FL Studio, Ableton, or anything else that opens wav files.

## Why this is not another slicer

Transient-threshold slicers cut on loudness. They do not know a kick from a snare, they do not know where the bar is, and they have no idea what the song is about.

This pipeline separates the track into drums, bass, vocals, and other, classifies every drum onset, finds the bpm and the key and the bar grid, transcribes the lyrics with timestamps, and scores mood and texture across the track. Claude then reads all of that alongside what you asked for and picks the regions that match, snapped to the grid. Every sample it returns carries the reason it was chosen.

So "dusty, melancholy, chop the horns, keep the hiss" gets an actual answer instead of the loudest eight moments in the file.

## Stack

| layer | tech |
| --- | --- |
| UI and API | Next.js App Router, TypeScript, React, Tailwind, shadcn/ui, on Vercel |
| auth, database, storage | Supabase, Google OAuth, Postgres with RLS |
| audio and ML | Modal GPU function running Demucs, faster-whisper, CLAP, librosa, ffmpeg |
| chop selection | Claude, via tool use for a schema-enforced result |
| payments | LemonSqueezy, one-time credit packs |
| playback | Web Audio API |

## Pipeline

Five stages, which are the five rows the loader screen shows you in real time over Supabase Realtime:

1. **pulled audio** yt-dlp or your upload, normalized to 44.1kHz wav
2. **separated stems** Demucs htdemucs into drums, bass, vocals, other
3. **reading instruments** bpm, bar grid, key, per-stem onsets, kick/snare/hat classification, timestamped lyrics, CLAP mood and texture scores
4. **finding chops** Claude reads the analysis plus your prompt and proposes up to 8 chops with reasons
5. **cutting on the grid** onset-snapped, bar-quantized, de-clicked, normalized, 24-bit wav, zipped

## Credits

5 credits a chop, 5 for a retry. 20 free credits a day, which is four chops. Packs are $4 for 100, $9 for 300, $25 for 1000. Credits do not expire.

Balances are server-owned. A single Postgres function takes the row lock, applies the daily grant if it is due, checks the balance, decrements, and writes an append-only ledger entry, all in the same transaction that creates the job. A job cannot exist without having been paid for, and credits cannot be taken without a job. If the pipeline fails you get the credits back.

## Repo layout

```
app/                next.js routes and api handlers
components/         shadcn primitives and chop.ai components
lib/                supabase clients, web audio engine, lemonsqueezy
supabase/           sql migrations
worker/             modal python app and pipeline stages
design/             design handoff this was built from
docs/               design spec and implementation plan
```

## Status

In development. Design spec is at [`docs/superpowers/specs/2026-09-11-chop-ai-design.md`](docs/superpowers/specs/2026-09-11-chop-ai-design.md).

## Notes

The YouTube path needs a residential proxy, because YouTube blocks datacenter IPs and downloading from it is against their terms of service. It sits behind one environment variable and degrades to "upload the file instead" when unavailable.

Chopped audio is private to the user who made it and served through signed URLs. There is no public sample library and no sharing.

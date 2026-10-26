# @zpredict/video

The pitch video (Remotion), cut from real headless-Chrome recordings of the live app, site and docs, with an ElevenLabs voiceover. The output becomes `apps/landing/public/pitch.mp4`.

```sh
cd apps/video
pnpm capture                               # record footage into public/footage/ (gitignored)
node --env-file=.env scripts/voice.mjs     # narration into public/voice/ (needs ELEVENLABS_API_KEY)
npx remotion studio                        # preview
npx remotion render Demo out/zpredict-demo.mp4
```

- `src/config.ts` holds the whole cut: shots, cameras (one eased push-in per shot), captions and narration lines.
- The voice files and their lengths (`src/voice.json`) are committed, so rendering needs no key. Set the key with `npx @elevenlabs/cli onboard init`; `.env` is gitignored.
- Shot list and timings: `SHOTLIST.md`.

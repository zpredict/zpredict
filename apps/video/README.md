# @zpredict/video

The pitch video (Remotion), cut from real headless-Chrome recordings of the live app, site and docs, with an ElevenLabs voiceover. The output becomes `apps/landing/public/pitch.mp4`.

```sh
cd apps/video
pnpm capture                               # record footage into public/footage/ (gitignored)
node --env-file=.env scripts/voice.mjs     # narration into public/voice/ (needs ELEVENLABS_API_KEY)
npx remotion studio                        # preview
npx remotion render Demo out/zpredict-demo.mp4
```

- `src/config.ts` holds the whole cut: shots, cameras (one eased push-in per shot), captions and narration lines. Shot starts come from the marks `pnpm capture` writes to `src/marks.json`; nothing is copied by hand.
- The voice files and each one's text and length (`src/voice.json`) are committed, so rendering needs no key.
- The render refuses a cut that is out of sync (`cutProblems` in `src/config.ts`): a voice file that speaks another line than its shot, a shot past the end of its clip, footage the next shot replays, or a trade take without a fill. Back-to-back shots of one clip never replay footage: a long line slows that shot's (mostly still) footage instead, never below 0.6x. Set the key with `npx @elevenlabs/cli onboard init`; `.env` is gitignored.
- Shot list and timings: `SHOTLIST.md`.

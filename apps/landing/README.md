# @zpredict/landing

The marketing site at https://zpredict.site (Astro, static): hero, how it works, threat model, the pitch video (`/pitch/`), Privacy Policy and Terms.

```sh
pnpm --filter @zpredict/landing dev
pnpm --filter @zpredict/landing build   # build, smoke test, privacy gate on dist/
pnpm --filter @zpredict/landing test    # legal pages
```

- Page copy lives in `src/data/` (markets, threats, legal), so it is reviewable in one place.
- `public/pitch.mp4` and `pitch-poster.jpg` are rendered by `apps/video`.
- Google Analytics 4 is the only third party (#226, `src/layouts/Base.astro`, production builds); the build fails on any other third-party URL (`privacy.mjs --analytics`).

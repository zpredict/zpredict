# @zpredict/ascii

The extruded zPredict mark rendered live as ASCII glyphs (MotionSites "ASCII Studio" pipeline), plus a static text snapshot of the same view. `three` is a regular dependency, so each app bundles it; nothing loads from a CDN.

```ts
import { asciiSnapshot, createAsciiScene } from "@zpredict/ascii";

// Server / build time: text for a <pre>, shown first and kept as the no-WebGL fallback.
const text = asciiSnapshot(); // 103 × 69 glyphs covering the framing square

// Client, after first paint (import it dynamically so three stays out of the main bundle):
const scene = createAsciiScene(canvas, { framing: { size: 0.86, x: 0.5, y: 0.55 } });
await scene.ready; // first frame drawn: fade the canvas in
scene.dispose();
```

- `createAsciiScene` throws when WebGL is unavailable; keep the snapshot in that case.
- The canvas is sized by CSS. Glyph cells are 6.8 × 10.2 design px on a 1600 × 1000 artboard (900 px wide below 900 px).
- Runs at 30 fps unless the pointer moves over it, pauses off-screen and in hidden tabs, hides itself on WebGL context loss and resumes on restore. Reduced motion draws one still frame.
- `framing` places the square that holds the mark: `size` is a share of `min(width, height)`, `x`/`y` its centre. The snapshot covers exactly that square, so size a `<pre>` to it.
- Build: `pnpm --filter @zpredict/ascii build` (the package exports `dist/`).

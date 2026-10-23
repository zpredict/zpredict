// Copies packages/brand into public/ so the brand has one source of truth.
// Layout follows packages/brand/README.md: black/* at the root, white/* under /white.
import { cpSync } from "node:fs";

const src = new URL("../../../packages/brand/", import.meta.url);
const pub = new URL("../public/", import.meta.url);
cpSync(new URL("black/", src), pub, { recursive: true });
cpSync(new URL("white/", src), new URL("white/", pub), { recursive: true });

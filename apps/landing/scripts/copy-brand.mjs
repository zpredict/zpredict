// packages/brand is the one source of truth; public/ only gets a build-time copy.
import { cpSync } from "node:fs";

const brand = new URL("../../../packages/brand/", import.meta.url);
const pub = new URL("../public/", import.meta.url);
cpSync(new URL("black/", brand), pub, { recursive: true });
cpSync(new URL("white/", brand), new URL("white/", pub), { recursive: true });

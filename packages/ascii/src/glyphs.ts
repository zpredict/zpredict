/**
 * Glyph atlas and the per-cell maths of the ASCII pass (ASCII Studio spec §7.4–7.5).
 * The post shader in shaders.ts mirrors these functions; the CPU snapshot and the tests use them.
 */

/** Light to dense. */
export const ALPHABET = ".:-=+*#%@0ONMWBX";
/** Atlas tile size in pixels, one tile per glyph. */
export const TILE_W = 12;
export const TILE_H = 16;
export const ATLAS_FONT = '14px "Courier New", monospace';

export const CONTRAST = 2.15;
/** Cells darker than this stay empty unless they sit on an edge. */
export const EMPTY_THRESHOLD = 0.12;
export const GLYPH_SPEED = 2.35;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** `fract(sin(dot(p, k)) * 43758.5453)`, the shader's cell hash. */
export function cellHash(x: number, y: number, kx = 127.1, ky = 311.7): number {
	const v = Math.sin(x * kx + y * ky) * 43758.5453;
	return v - Math.floor(v);
}

/** Contrast-stretched light from the stable luminance plus a share of the moving accent. */
export function cellLight(
	stable: number,
	accent: number,
	share = 0.75,
	contrast = CONTRAST,
): number {
	return clamp01((stable + accent * share - 0.5) * contrast + 0.5);
}

/** Glyph density for a cell; edges keep at least a light glyph. */
export function cellDensity(light: number, edge: number): number {
	return Math.max(clamp01((light - 0.5) * 1.15 + 0.5), edge * 0.28);
}

export function hasGlyph(light: number, edge: number): boolean {
	return light >= EMPTY_THRESHOLD || edge > 0.5;
}

/** Atlas tile for a density in [0, 1]. */
export function glyphTile(density: number, count = ALPHABET.length): number {
	return Math.min(count - 1, Math.max(0, Math.floor(density * count)));
}

/** Flicker phases 0..3 move the tile by −1, 0, +1, 0; the ends reflect instead of clamping. */
export function flickerTile(tile: number, phase: number, count = ALPHABET.length): number {
	const t = tile + [-1, 0, 1, 0][phase & 3];
	if (t < 0) return -t;
	if (t > count - 1) return 2 * (count - 1) - t;
	return t;
}

/** Flicker phase of a cell at time `t` (seconds): each cell keeps its own 0.35–0.55 s tempo. */
export function flickerPhase(t: number, x: number, y: number, speed = GLYPH_SPEED): number {
	const interval = 0.35 + 0.2 * cellHash(x, y, 269.5, 183.3);
	return Math.floor((t * speed) / interval + cellHash(x, y) * 4) % 4;
}

/** Atlas u range [u0, u1] of a tile, inset 2% on each side like the shader. */
export function tileU(tile: number, count = ALPHABET.length): [number, number] {
	return [(tile + 0.02) / count, (tile + 0.98) / count];
}

/** Draws `chars` white on black, one centred TILE_W × TILE_H tile each. */
export function drawAtlas(ctx: CanvasRenderingContext2D, chars: string): void {
	ctx.canvas.width = TILE_W * chars.length;
	ctx.canvas.height = TILE_H;
	ctx.fillStyle = "#000";
	ctx.fillRect(0, 0, ctx.canvas.width, TILE_H);
	ctx.fillStyle = "#fff";
	ctx.font = ATLAS_FONT;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	[...chars].forEach((c, i) => {
		ctx.fillText(c, i * TILE_W + TILE_W / 2, TILE_H / 2);
	});
}

/**
 * Shared scene constants, so the live renderer and the static snapshot frame the mark the same way.
 * World units: the mark stands on the ground (y = 0), 2 × MARK_SCALE tall.
 */
export const MARK_SCALE = 0.3;
/** Extrusion depth and bevel, in mark units (the mark spans ±1). */
export const MARK_DEPTH = 0.34;
export const MARK_BEVEL = 0.035;
/** Camera elevation (radians) and the mark's resting yaw. */
export const ELEVATION = 0.42;
export const BASE_YAW = -0.72;
/** World-space side of the square the mark is framed in. */
export const FRAME = 0.78;

/** Default glyph cell width in design px (height is 1.5×). */
export const CELL = 6.8;

/** Where the framing square sits: side as a share of min(width, height), centre as shares of width/height. */
export interface Framing {
	size: number;
	x: number;
	y: number;
}
export const DEFAULT_FRAMING: Framing = { size: 0.7, x: 0.5, y: 0.55 };

/** Design px per CSS px: a 1600 × 1000 artboard, or 900 logical px across at ≤ 900 px wide. */
export function designScale(width: number, height: number): number {
	return width <= 900 ? width / 900 : Math.min(width / 1600, height / 1000);
}

/** Orthographic frustum (world units, relative to the mark centre) for a w × h design-px view. */
export function frustum(w: number, h: number, framing: Framing = DEFAULT_FRAMING) {
	const side = framing.size * Math.min(w, h);
	const u = FRAME / side;
	const cx = framing.x * w;
	const cy = framing.y * h;
	return { left: -cx * u, right: (w - cx) * u, top: cy * u, bottom: -(h - cy) * u };
}

const norm3 = (x: number, y: number, z: number): [number, number, number] => {
	const l = Math.hypot(x, y, z);
	return [x / l, y / l, z / l];
};
export const KEY = norm3(-0.8, 0.5, 0.36);
export const FILL = norm3(0.73, 0.6, -0.14);

/** Fixed studio light of a surface (spec §7.2 `stable`), from its world normal and height. */
export function stableLight(n: [number, number, number], worldY: number): number {
	const dot = (a: [number, number, number]) => Math.max(0, n[0] * a[0] + n[1] * a[1] + n[2] * a[2]);
	const contact = 0.02 * Math.exp(-Math.max(worldY, 0) / 0.02) * (1 - Math.abs(n[1]));
	const v = 0.24 + dot(KEY) * 0.43 + dot(FILL) * 0.13 + Math.max(n[1], 0) * 0.14 - contact;
	return Math.min(0.78, Math.max(0.22, v));
}

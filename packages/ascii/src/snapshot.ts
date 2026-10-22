/**
 * Static ASCII snapshot of the mark, computed on the CPU (no WebGL): the first paint, the
 * no-WebGL / reduced-motion fallback, and what the live canvas fades in over. It ray-casts the
 * extruded mark with the same camera, framing and studio light as the live scene, then applies
 * the same density and flicker maths, so the two line up closely.
 */
import {
	ALPHABET,
	cellDensity,
	cellLight,
	flickerPhase,
	flickerTile,
	glyphTile,
	hasGlyph,
} from "./glyphs.js";
import { inside, markPolygons, type Point, signedArea } from "./mark.js";
import { BASE_YAW, ELEVATION, FRAME, MARK_DEPTH, MARK_SCALE, stableLight } from "./view.js";

export interface SnapshotOptions {
	/** Text columns and rows covering the FRAME square. Default 103 × 69 (6.8 × 10.2 cells). */
	cols?: number;
	rows?: number;
	yaw?: number;
}

type Vec3 = [number, number, number];
const DZ = MARK_DEPTH / 2;
const EPS = 1e-9;
const cross2 = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

type Hit = { t: number; n: Vec3 };

/** Front and back caps (z = ±DZ). */
function capHit(polys: Point[][], o: Vec3, d: Vec3): Hit | null {
	if (Math.abs(d[2]) < EPS) return null;
	let best: Hit | null = null;
	for (const z of [DZ, -DZ]) {
		const t = (z - o[2]) / d[2];
		if (t <= 0 || (best && t >= best.t)) continue;
		if (polys.some((poly) => inside(poly, o[0] + t * d[0], o[1] + t * d[1])))
			best = { t, n: [0, 0, Math.sign(z)] };
	}
	return best;
}

/** Side walls: each polygon edge swept along z. */
function wallHit(poly: Point[], o: Vec3, d: Vec3): Hit | null {
	const ccw = signedArea(poly) > 0 ? 1 : -1;
	let best: Hit | null = null;
	for (let i = 0; i < poly.length; i++) {
		const [ax, ay] = poly[i];
		const [bx, by] = poly[(i + 1) % poly.length];
		const ex = bx - ax;
		const ey = by - ay;
		const den = cross2(d[0], d[1], ex, ey);
		if (Math.abs(den) < EPS) continue;
		const t = cross2(ax - o[0], ay - o[1], ex, ey) / den;
		const s = cross2(ax - o[0], ay - o[1], d[0], d[1]) / den;
		const onWall = s >= 0 && s <= 1 && t > 0 && Math.abs(o[2] + t * d[2]) <= DZ;
		if (!onWall || (best && t >= best.t)) continue;
		const l = Math.hypot(ex, ey);
		best = { t, n: [(ccw * ey) / l, (-ccw * ex) / l, 0] };
	}
	return best;
}

/** Nearest hit of a local-space ray with the extruded slabs. */
function cast(polys: Point[][], o: Vec3, d: Vec3): Hit | null {
	return [capHit(polys, o, d), ...polys.map((p) => wallHit(p, o, d))].reduce<Hit | null>(
		(a, b) => (b && (!a || b.t < a.t) ? b : a),
		null,
	);
}

/** Stable light per cell (row-major), null where the ray misses the mark. */
function stableGrid(cols: number, rows: number, yaw: number): (number | null)[] {
	const polys = markPolygons(16);
	const se = Math.sin(ELEVATION);
	const ce = Math.cos(ELEVATION);
	const cy = Math.cos(yaw);
	const sy = Math.sin(yaw);
	// world → local: undo the yaw (the camera looks along (0, -se, -ce)).
	const dir: Vec3 = [ce * sy, -se, -ce * cy];
	const grid: (number | null)[] = [];
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const sx = ((c + 0.5) / cols - 0.5) * FRAME;
			const sv = (0.5 - (r + 0.5) / rows) * FRAME;
			// A point on the view plane through the mark centre, backed off along the view ray.
			const x = sx;
			const y = ce * sv + se * 5;
			const z = -se * sv + ce * 5;
			const o: Vec3 = [
				(x * cy - z * sy) / MARK_SCALE,
				y / MARK_SCALE,
				(x * sy + z * cy) / MARK_SCALE,
			];
			const hit = cast(polys, o, dir);
			if (!hit) {
				grid.push(null);
				continue;
			}
			const [nx, ny, nz] = hit.n;
			const localY = o[1] + hit.t * dir[1];
			grid.push(
				stableLight([nx * cy + nz * sy, ny, -nx * sy + nz * cy], MARK_SCALE * (localY + 1)),
			);
		}
	}
	return grid;
}

const NEIGHBOURS = [
	[1, 0],
	[-1, 0],
	[0, 1],
	[0, -1],
];

/** Returns `rows` lines of up to `cols` characters (trailing spaces trimmed). */
export function asciiSnapshot({
	cols = 103,
	rows = 69,
	yaw = BASE_YAW,
}: SnapshotOptions = {}): string {
	const grid = stableGrid(cols, rows, yaw);
	const at = (c: number, r: number) =>
		c < 0 || r < 0 || c >= cols || r >= rows ? null : grid[r * cols + c];
	const glyph = (c: number, r: number): string => {
		const s = at(c, r);
		if (s === null) return " ";
		let silhouette = 0;
		let tone = 0;
		for (const [dc, dr] of NEIGHBOURS) {
			const ns = at(c + dc, r + dr);
			if (ns === null) silhouette = 1;
			else tone = Math.max(tone, Math.abs(ns - s));
		}
		const k = Math.min(1, Math.max(0, (tone - 0.14) / 0.16));
		const edge = Math.max(silhouette, k * k * (3 - 2 * k));
		const light = cellLight(s, 0);
		if (!hasGlyph(light, edge)) return " ";
		return ALPHABET[flickerTile(glyphTile(cellDensity(light, edge)), flickerPhase(0, c, r))];
	};
	const lines: string[] = [];
	for (let r = 0; r < rows; r++) {
		let line = "";
		for (let c = 0; c < cols; c++) line += glyph(c, r);
		lines.push(line.trimEnd());
	}
	return lines.join("\n");
}

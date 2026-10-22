/**
 * The zPredict mark as vector paths, traced from packages/brand/black/android-chrome-512x512.png:
 * two square-cornered slabs whose rounded ends curl into a notch. The lower slab is the upper one
 * turned 180° about the image centre. Coordinates are normalised so the mark spans y ∈ [-1, 1],
 * y up, centred on the origin.
 */
export type Point = [number, number];
/** A straight line `[x, y]` or a cubic Bézier `[c1x, c1y, c2x, c2y, x, y]`, from the previous point. */
export type Segment = [number, number] | [number, number, number, number, number, number];

export interface MarkPath {
	start: Point;
	segments: Segment[];
}

// Upper slab in the 512 px image (y down). Its notch tip sits at (400, 252).
const UPPER_START: Point = [22, 0];
const UPPER: Segment[] = [
	[386, 0],
	[445, 0, 492, 57, 492, 128],
	[492, 185, 455, 235, 400, 252],
	[405, 235, 400, 210, 382, 205],
	[22, 205],
];

const CX = 257;
const CY = 256;
const UNIT = 256;

const norm = (x: number, y: number): Point => [(x - CX) / UNIT, (CY - y) / UNIT];
/** 180° turn about the image centre. */
const turn = (x: number, y: number): Point => [2 * CX - x, 2 * CY - y];

function mapPath(start: Point, segments: Segment[], f: (x: number, y: number) => Point): MarkPath {
	const mapSeg = (s: Segment): Segment => {
		const out: number[] = [];
		for (let i = 0; i < s.length; i += 2) out.push(...f(s[i], s[i + 1]));
		return out as Segment;
	};
	return { start: f(...start), segments: segments.map(mapSeg) };
}

/** Both slabs, upper first, in normalised coordinates. */
export function markPaths(): MarkPath[] {
	return [
		mapPath(UPPER_START, UPPER, norm),
		mapPath(UPPER_START, UPPER, (x, y) => norm(...turn(x, y))),
	];
}

/** Each slab as a closed polygon (no repeated end point); every curve is cut into `steps` lines. */
export function markPolygons(steps = 12): Point[][] {
	return markPaths().map(({ start, segments }) => {
		const pts: Point[] = [start];
		let [px, py] = start;
		for (const s of segments) {
			if (s.length === 2) {
				pts.push([s[0], s[1]]);
			} else {
				const [ax, ay, bx, by, x, y] = s;
				for (let i = 1; i <= steps; i++) {
					const t = i / steps;
					const u = 1 - t;
					const w0 = u * u * u;
					const w1 = 3 * u * u * t;
					const w2 = 3 * u * t * t;
					const w3 = t * t * t;
					pts.push([w0 * px + w1 * ax + w2 * bx + w3 * x, w0 * py + w1 * ay + w2 * by + w3 * y]);
				}
			}
			[px, py] = pts[pts.length - 1];
		}
		const [fx, fy] = pts[0];
		const [lx, ly] = pts[pts.length - 1];
		if (Math.abs(fx - lx) < 1e-9 && Math.abs(fy - ly) < 1e-9) pts.pop();
		return pts;
	});
}

/** Shoelace area; positive for counter-clockwise (y up). */
export function signedArea(poly: Point[]): number {
	let a = 0;
	for (let i = 0; i < poly.length; i++) {
		const [x0, y0] = poly[i];
		const [x1, y1] = poly[(i + 1) % poly.length];
		a += x0 * y1 - x1 * y0;
	}
	return a / 2;
}

/** Even-odd point-in-polygon test. */
export function inside(poly: Point[], x: number, y: number): boolean {
	let hit = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, yi] = poly[i];
		const [xj, yj] = poly[j];
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
	}
	return hit;
}

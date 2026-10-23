// QR codes for ZIP 321 payment requests, made in the browser (uqr, bundled; no network).
import { encode } from "uqr";

/** QR modules for `text` with a 4-module quiet zone; `true` is dark. ECC L keeps a 1 kB URI scannable. */
export const qrModules = (text: string): boolean[][] => encode(text, { ecc: "L", border: 4 }).data;

/** One SVG path covering the dark modules, a horizontal run per segment. */
export function qrPath(m: boolean[][]): string {
	let d = "";
	m.forEach((row, y) => {
		for (let x = 0; x < row.length; ) {
			if (!row[x]) {
				x++;
				continue;
			}
			let n = 1;
			while (row[x + n]) n++;
			d += `M${x} ${y}h${n}v1h-${n}z`;
			x += n;
		}
	});
	return d;
}

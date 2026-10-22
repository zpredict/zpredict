// Byte helpers shared by order sharing and the deposit memo.

export const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export const toHex = (b: Uint8Array) =>
	Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

// A single character class keeps matching linear (no nested quantifier to backtrack into).
const HEX = /^[0-9a-f]*$/i;

export function fromHex(h: string): Uint8Array {
	if (h.length % 2 !== 0 || !HEX.test(h)) throw new SyntaxError("bad hex");
	return Uint8Array.from(h.match(/../g) ?? [], (x) => Number.parseInt(x, 16));
}

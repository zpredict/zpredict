// Account key backup (#134): the tag as one copyable line with a version and a checksum, so a
// typo or a truncated paste is caught on import instead of opening an empty account.

import { blake2b } from "@noble/hashes/blake2.js";
import { fromHex, toHex } from "./bytes.js";
import { KEY_LEN } from "./memo.js";

const PREFIX = "zpredict-key-1";
const PERSONAL = new TextEncoder().encode("zPredictKeyBkup1");

const check = (tag: string) =>
	toHex(blake2b(fromHex(tag), { dkLen: 4, personalization: PERSONAL }));

const isTag = (t: string) => new RegExp(`^[0-9a-f]{${KEY_LEN * 2}}$`).test(t);

/** `zpredict-key-1:<tag hex>:<checksum>`. Anyone holding it controls the account. */
export function exportKey(tag: string): string {
	if (!isTag(tag)) throw new Error("not an account tag");
	return `${PREFIX}:${tag}:${check(tag)}`;
}

/** The tag in a backup line (whitespace and case tolerated), or an error message. */
export function importKey(text: string): { tag: string } | { error: string } {
	const parts = text.trim().toLowerCase().replace(/\s+/g, "").split(":");
	if (parts.length !== 3 || parts[0] !== PREFIX)
		return { error: `Not a zPredict key: it starts with "${PREFIX}:".` };
	const [, tag, sum] = parts;
	if (!isTag(tag)) return { error: "The key part is damaged (wrong length or characters)." };
	if (sum !== check(tag)) return { error: "The checksum doesn't match: a character is wrong." };
	return { tag };
}

// The relayer HTTP API (DESIGN.md "Relayer API"), served once per relayer index.
// Nothing is logged: no IPs, no bodies.
import { generateKeyPairSync } from "node:crypto";
import { ORDER_LEN } from "@zpredict/sdk";
import { JUDGE_CREDIT, PORTS } from "./config.mjs";
import { GROUP_KEY } from "./rolling.mjs";
import { hex, u64le, xor } from "./shares.mjs";
import { accept, account, chain, keys, markets, orders, views } from "./state.mjs";
import { getWithdrawal, postWithdrawal } from "./withdrawals.mjs";

const HEX = (n) => new RegExp(`^[0-9a-f]{${n}}$`);

function send(res, code, body) {
	res.writeHead(code, {
		"content-type": "application/json",
		"access-control-allow-origin": process.env.MOCK_ORIGIN ?? "*",
		"access-control-allow-methods": "GET, POST, OPTIONS",
		"access-control-allow-headers": "content-type",
		"cache-control": "no-store",
	});
	res.end(body === undefined ? "" : JSON.stringify(body));
}

function readJson(req) {
	return new Promise((ok) => {
		let s = "";
		req.on("data", (c) => {
			s += c;
			if (s.length > 1024) req.destroy();
		});
		req.on("end", () => {
			try {
				ok(JSON.parse(s));
			} catch {
				ok(null);
			}
		});
	});
}

const health = (i) => ({
	relayer: i,
	height: chain.height,
	batch: chain.batch,
	peers: PORTS.map(() => true),
});

async function postOrder(i, req, res) {
	const b = await readJson(req);
	if (!b || !HEX(32).test(b.orderId) || !HEX(ORDER_LEN * 2).test(b.share) || !HEX(32).test(b.token))
		return send(res, 400, { error: "bad order" });
	if (!accept(i, b.orderId, Buffer.from(b.share, "hex"), b.token))
		return send(res, 409, { error: "duplicate" });
	send(res, 202, { batch: chain.batch });
}

function getOrder(i, id, url, res) {
	const o = orders.get(id);
	const token = url.searchParams.get("token");
	if (!o?.shares[i] || !token || o.tokens[i] !== token)
		return send(res, 404, { error: "unknown order" });
	if (o.status === "pending") return send(res, 200, { status: "pending" });
	send(res, 200, { status: o.status, fillShare: hex(o.fillShares[i]) });
}

function getAccount(i, id, url, res) {
	const key = url.searchParams.get("key") ?? "";
	if (!HEX(32).test(key)) return send(res, 404, { error: "bad account" });
	const k = keys.get(id);
	if (k?.[i] && hex(k[i]) !== key) return send(res, 403, { error: "wrong key" });
	const zero = { bal: 0n, mask: [u64le(0n), u64le(0n)] };
	const a = k?.every(Boolean) ? account(hex(xor(...k))) : zero;
	const share = i < 2 ? a.mask[i] : xor(u64le(a.bal), ...a.mask);
	send(res, 200, { balanceShare: hex(share) });
}

function getView(i, url, res) {
	const after = Number(url.searchParams.get("after") ?? 0);
	const items = views[i].items.filter((x) => x.seq > after).slice(0, 200);
	send(res, 200, { items });
}

// One X25519 memo key per relayer, fresh per process. The mock never scans deposits, so
// the secret halves are dropped; the keys only let the deposit flow build a memo.
const memoKeys = PORTS.map(() =>
	Buffer.from(generateKeyPairSync("x25519").publicKey.export({ format: "jwk" }).x, "base64url"),
);

// Relayer i registers its share of a new account's tag; once all three hold one, the mock
// (which sees everything) credits the combined tag. A real relayer never sees the tag.
async function judgeClaim(i, req, res) {
	const b = await readJson(req);
	if (!b || !HEX(16).test(b.account) || !HEX(32).test(b.keyShare))
		return send(res, 400, { error: "bad claim" });
	const k = keys.get(b.account) ?? [null, null, null];
	if (k[i]) {
		const again = hex(k[i]) === b.keyShare;
		return again ? send(res, 200, {}) : send(res, 409, { error: "account exists" });
	}
	k[i] = Buffer.from(b.keyShare, "hex");
	keys.set(b.account, k);
	if (k.every(Boolean)) account(hex(xor(...k))).bal += JUDGE_CREDIT;
	send(res, 200, {});
}

/** [method, path pattern, handler(i, ctx)]; ctx = { req, res, url, m: regex match }. */
const ROUTES = [
	["GET", /^\/health$/, (i, { res }) => send(res, 200, health(i))],
	[
		"GET",
		/^\/memo-key$/,
		(i, { res }) => send(res, 200, { relayer: i, memoKey: hex(memoKeys[i]) }),
	],
	["GET", /^\/markets$/, (_, { res }) => send(res, 200, markets)],
	[
		"GET",
		/^\/group-key$/,
		(i, { res }) => send(res, 200, { relayer: i, groupKey: GROUP_KEY, threshold: 2 }),
	],
	["GET", /^\/view$/, (i, { url, res }) => getView(i, url, res)],
	["POST", /^\/orders$/, (i, { req, res }) => postOrder(i, req, res)],
	["POST", /^\/judge\/claim$/, (i, { req, res }) => judgeClaim(i, req, res)],
	["GET", /^\/orders\/([0-9a-f]{32})$/, (i, { m, url, res }) => getOrder(i, m[1], url, res)],
	["GET", /^\/accounts\/([0-9a-f]{16})$/, (i, { m, url, res }) => getAccount(i, m[1], url, res)],
	["POST", /^\/withdrawals$/, (i, { req, res }) => postWithdrawal(i, req, res, send, readJson)],
	["GET", /^\/withdrawals\/([0-9a-f]{32})$/, (_, { m, res }) => getWithdrawal(m[1], res, send)],
];

/** Request handler for relayer `i`. */
export const handler = (i) => (req, res) => {
	if (req.method === "OPTIONS") return send(res, 204);
	const url = new URL(req.url, "http://relayer");
	for (const [method, re, fn] of ROUTES) {
		const m = req.method === method && url.pathname.match(re);
		if (m) return fn(i, { req, res, url, m });
	}
	send(res, 404, { error: "not found" });
};

// The relayer HTTP API (DESIGN.md "Relayer API"), served once per relayer index.
// Nothing is logged: no IPs, no bodies.
import { randomBytes } from "node:crypto";
import { ORDER_LEN } from "@zpredict/sdk";
import { JUDGE_CREDIT, PORTS } from "./config.mjs";
import { hex, u64le, xor } from "./shares.mjs";
import { accept, account, chain, markets, orders, views } from "./state.mjs";

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
	if (!b || !HEX(32).test(b.orderId) || !HEX(ORDER_LEN * 2).test(b.share))
		return send(res, 400, { error: "bad order" });
	if (!accept(i, b.orderId, Buffer.from(b.share, "hex")))
		return send(res, 409, { error: "duplicate" });
	send(res, 202, { batch: chain.batch });
}

function getOrder(i, id, res) {
	const o = orders.get(id);
	if (!o?.shares[i]) return send(res, 404, { error: "unknown order" });
	if (o.status === "pending") return send(res, 200, { status: "pending" });
	send(res, 200, { status: o.status, fillShare: hex(o.fillShares[i]) });
}

function getAccount(i, tag, res) {
	const a = account(Buffer.from(tag, "hex").readBigUInt64LE(0));
	const share = i < 2 ? a.mask[i] : xor(u64le(a.bal), ...a.mask);
	send(res, 200, { balanceShare: hex(share) });
}

function getView(i, url, res) {
	const after = Number(url.searchParams.get("after") ?? 0);
	const items = views[i].items.filter((x) => x.seq > after).slice(0, 200);
	send(res, 200, { items });
}

function judgeClaim(res) {
	const tag = randomBytes(16);
	account(tag.readBigUInt64LE(0)).bal += JUDGE_CREDIT;
	send(res, 200, { tag: hex(tag) });
}

/** [method, path pattern, handler(i, ctx)]; ctx = { req, res, url, m: regex match }. */
const ROUTES = [
	["GET", /^\/health$/, (i, { res }) => send(res, 200, health(i))],
	["GET", /^\/markets$/, (_, { res }) => send(res, 200, markets)],
	["GET", /^\/view$/, (i, { url, res }) => getView(i, url, res)],
	["POST", /^\/orders$/, (i, { req, res }) => postOrder(i, req, res)],
	["POST", /^\/judge\/claim$/, (_, { res }) => judgeClaim(res)],
	["GET", /^\/orders\/([0-9a-f]{32})$/, (i, { m, res }) => getOrder(i, m[1], res)],
	["GET", /^\/accounts\/([0-9a-f]{32})$/, (i, { m, res }) => getAccount(i, m[1], res)],
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

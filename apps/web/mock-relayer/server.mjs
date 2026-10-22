// Mock relayers: three HTTP servers (one per relayer) implementing the relayer API contract.
//
// MOCK: the three relayers live in one process and the batch step combines their shares
// in the clear. The real relayers never see each other's shares: they run `clear` inside
// 3-party MPC (polytune). Everything a client can observe over HTTP matches the contract.
// Not logged: request IPs, bodies, anything.
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { decodeOrder, encodeOrder, ORDER_LEN } from "@zpredict/sdk";
import { clear, fillRecords } from "./clear.mjs";

const PORTS = (process.env.MOCK_PORTS ?? "4101,4102,4103")
	.split(",")
	.map(Number);
const BATCH_MS = Number(process.env.MOCK_BATCH_MS ?? 5000);
const BOT_MS = Number(process.env.MOCK_BOT_MS ?? 900);
const JUDGE_CREDIT = 25n * 200n; // 25 units in half-ticks
const VIEW_KEEP = 400;

let batch = 1;
let height = 3_128_400;
const markets = [
	{
		id: 1,
		question: "Will NU7 activate on mainnet by height 3,200,000?",
		plugin: "nu7-activation",
		params: { activationHeight: 3_200_000 },
	},
	{
		id: 2,
		question:
			"Will the Ironwood pool hold more than 500,000 ZEC at height 3,140,000?",
		plugin: "ironwood-pool",
		params: { thresholdZec: 500_000, atHeight: 3_140_000 },
	},
	{
		id: 3,
		question: "Will block 3,135,000 contain more than 40 shielded actions?",
		plugin: "shielded-actions",
		params: { height: 3_135_000, minActions: 40 },
	},
].map((m) => ({
	...m,
	closeHeight: height + 4000,
	resolveHeight: height + 4100,
	status: "open",
}));

const hex = (b) => Buffer.from(b).toString("hex");
const xor = (...bs) => bs.reduce((a, b) => a.map((x, i) => x ^ b[i]));
/** Three XOR shares of `bytes`; share i goes to relayer i only. */
const split = (bytes) => {
	const r0 = randomBytes(bytes.length);
	const r1 = randomBytes(bytes.length);
	return [r0, r1, Buffer.from(xor(Uint8Array.from(bytes), r0, r1))];
};
const u64le = (n) => {
	const b = Buffer.alloc(8);
	b.writeBigUInt64LE(n);
	return b;
};

// ---- state ---------------------------------------------------------------------------
/** orderId -> { shares: [Buffer|null x3], status, fillShares, born } */
const orders = new Map();
/** account (bigint) -> { bal: bigint (half-ticks), mask: [Buffer, Buffer] } */
const accounts = new Map();
const views = PORTS.map(() => ({ seq: 0, items: [] }));

const account = (id) => {
	let a = accounts.get(id);
	if (!a) {
		// ponytail: masks are fixed per account, so shares fetched mid-batch can mismatch for one poll
		a = { bal: 0n, mask: [randomBytes(8), randomBytes(8)] };
		accounts.set(id, a);
	}
	return a;
};
const see = (i, kind, orderId, share) => {
	const v = views[i];
	v.items.push({ seq: ++v.seq, kind, orderId, share: hex(share) });
	if (v.items.length > VIEW_KEEP) v.items.shift();
};
const accept = (i, orderId, share) => {
	let o = orders.get(orderId);
	if (!o) {
		o = {
			shares: [null, null, null],
			status: "pending",
			fillShares: null,
			born: batch,
		};
		orders.set(orderId, o);
	}
	if (o.shares[i]) return false;
	o.shares[i] = share;
	see(i, "order", orderId, share);
	return true;
};

// ---- batch: the step the real relayers run inside MPC -------------------------------
function runBatch() {
	const ready = [];
	for (const [id, o] of orders) {
		if (o.status !== "pending") continue;
		if (o.shares.every(Boolean)) ready.push([id, o]);
		else if (batch - o.born > 2) ready.push([id, o]); // a share never arrived
	}
	const decoded = ready.map(([, o]) =>
		o.shares.every(Boolean) ? decodeOrder(xor(...o.shares)) : null,
	);
	// Balance check: an order that can't cover its worst-case cost becomes a dummy (size 0).
	const reserved = new Map();
	const live = decoded.map((d) => {
		if (!d || !markets.some((m) => m.id === d.market && m.status === "open"))
			return null;
		const max = BigInt(d.size) * BigInt(d.price) * 2n;
		const r = (reserved.get(d.account) ?? 0n) + max;
		if (account(d.account).bal < r) return { ...d, size: 0 };
		reserved.set(d.account, r);
		return d;
	});
	// One 10-byte fill record per order (all zero if unfilled), cleared market by market.
	const records = live.map(() => new Uint8Array(10));
	for (const m of markets) {
		const idx = live.flatMap((d, k) => (d && d.market === m.id ? [k] : []));
		const sub = idx.map((k) => live[k]);
		fillRecords(sub, clear(sub)).forEach((r, j) => {
			records[idx[j]] = r;
		});
	}
	ready.forEach(([id, o], k) => {
		const fill = Buffer.from(records[k]);
		const filled = fill[9] === 1;
		if (filled) account(decoded[k].account).bal -= BigInt(fill.readUInt32LE(4));
		o.status = filled ? "filled" : "unfilled";
		o.fillShares = split(fill);
		// Every order in the batch gets a fill share, filled or not: same shape either way.
		PORTS.forEach((_, i) => {
			see(i, "fill", id, o.fillShares[i]);
		});
	});
	batch++;
	height++;
}

// ---- background traders, so the demo has counterparties and noise -----------------
const bots = Array.from({ length: 6 }, () => randomBytes(8).readBigUInt64LE());
for (const b of bots) account(b).bal = 10n ** 12n;
const fair = new Map(
	markets.map((m) => [m.id, 40 + Math.floor(Math.random() * 25)]),
);
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
function botOrder() {
	const m = markets[rnd(0, markets.length - 1)];
	const f = Math.min(85, Math.max(15, fair.get(m.id) + rnd(-1, 1)));
	fair.set(m.id, f);
	const side = rnd(0, 1);
	const ask = side === 0 ? f : 100 - f;
	const price = Math.min(99, Math.max(1, ask + rnd(-6, 8)));
	const bytes = encodeOrder({
		market: m.id,
		side,
		price,
		size: rnd(1, 12),
		account: bots[rnd(0, 5)],
	});
	const id = hex(randomBytes(16));
	split(bytes).forEach((s, i) => {
		accept(i, id, s);
	});
}

// ---- HTTP ----------------------------------------------------------------------------
const HEX = (n) => new RegExp(`^[0-9a-f]{${n}}$`);
const send = (res, code, body) => {
	res.writeHead(code, {
		"content-type": "application/json",
		"access-control-allow-origin": "*",
		"access-control-allow-methods": "GET, POST, OPTIONS",
		"access-control-allow-headers": "content-type",
		"cache-control": "no-store",
	});
	res.end(body === undefined ? "" : JSON.stringify(body));
};
const readJson = (req) =>
	new Promise((ok) => {
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

function handler(i) {
	return async (req, res) => {
		const url = new URL(req.url, "http://x");
		const p = url.pathname;
		if (req.method === "OPTIONS") return send(res, 204);
		if (req.method === "GET" && p === "/health")
			return send(res, 200, {
				relayer: i,
				height,
				batch,
				peers: PORTS.map(() => true),
			});
		if (req.method === "GET" && p === "/markets")
			return send(res, 200, markets);
		if (req.method === "POST" && p === "/orders") {
			const b = await readJson(req);
			if (!b || !HEX(32).test(b.orderId) || !HEX(ORDER_LEN * 2).test(b.share))
				return send(res, 400, { error: "bad order" });
			if (!accept(i, b.orderId, Buffer.from(b.share, "hex")))
				return send(res, 409, { error: "duplicate" });
			return send(res, 202, { batch });
		}
		let m = p.match(/^\/orders\/([0-9a-f]{32})$/);
		if (req.method === "GET" && m) {
			const o = orders.get(m[1]);
			if (!o?.shares[i]) return send(res, 404, { error: "unknown order" });
			if (o.status === "pending") return send(res, 200, { status: "pending" });
			return send(res, 200, {
				status: o.status,
				fillShare: hex(o.fillShares[i]),
			});
		}
		m = p.match(/^\/accounts\/([0-9a-f]{32})$/);
		if (req.method === "GET" && m) {
			const a = account(Buffer.from(m[1], "hex").readBigUInt64LE(0));
			const share = i < 2 ? a.mask[i] : xor(u64le(a.bal), ...a.mask);
			return send(res, 200, { balanceShare: hex(share) });
		}
		if (req.method === "GET" && p === "/view") {
			const after = Number(url.searchParams.get("after") ?? -1);
			const items = views[i].items;
			const out =
				after < 0
					? items.slice(-40)
					: items.filter((x) => x.seq > after).slice(0, 200);
			return send(res, 200, { items: out });
		}
		if (req.method === "POST" && p === "/judge/claim") {
			const tag = randomBytes(16);
			account(tag.readBigUInt64LE(0)).bal += JUDGE_CREDIT;
			return send(res, 200, { tag: hex(tag) });
		}
		send(res, 404, { error: "not found" });
	};
}

PORTS.forEach((port, i) => {
	createServer(handler(i)).listen(port, () => {
		console.log(`mock relayer ${i} on http://localhost:${port}`);
	});
});
setInterval(runBatch, BATCH_MS);
setInterval(botOrder, BOT_MS);

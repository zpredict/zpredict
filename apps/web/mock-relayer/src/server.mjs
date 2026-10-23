// Mock relayers: three HTTP servers, one per relayer, implementing the relayer API.
//
// MOCK: the three relayers share one process and the batch combines their shares in the
// clear. Real relayers never see each other's shares; they run `clear` inside 3-party MPC.
// Everything a client can observe over HTTP matches the contract.
import { createServer } from "node:http";
import { runBatch } from "./batch.mjs";
import { botOrders } from "./bots.mjs";
import { BATCH_MS, BOT_MS, PORTS, WARMUP_BATCHES } from "./config.mjs";
import { handler } from "./routes.mjs";

// Warm-up: real batches of bot orders, so markets have a price and history on first load,
// back-dated across the last 30 days so the price chart has a time axis to show.
const DAY_MS = 86_400_000;
for (let b = 0; b < WARMUP_BATCHES; b++) {
	botOrders();
	botOrders();
	runBatch(Date.now() - ((WARMUP_BATCHES - b) * 30 * DAY_MS) / WARMUP_BATCHES);
}

PORTS.forEach((port, i) => {
	createServer(handler(i)).listen(port, () => {
		console.log(`mock relayer ${i} on http://localhost:${port}`);
	});
});
setInterval(runBatch, BATCH_MS);
setInterval(botOrders, BOT_MS);

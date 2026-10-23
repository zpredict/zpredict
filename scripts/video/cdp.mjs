// Headless Chrome over the DevTools Protocol with Node's built-in WebSocket: no dependencies.
// record() pipes Page.startScreencast frames into ffmpeg at a constant 30 fps (the latest frame
// is repeated while the page is still), so a shot is real time, 1920x1080.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const W = 1920;
export const H = 1080;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch() {
	const proc = spawn(
		CHROME,
		[
			"--headless=new",
			"--remote-debugging-port=0",
			`--user-data-dir=${mkdtempSync(join(tmpdir(), "zp-video-"))}`,
			`--window-size=${W},${H}`,
			"--hide-scrollbars",
			"--mute-audio",
			"--no-first-run",
			"--force-color-profile=srgb",
			// CI runners (Ubuntu 24.04) forbid the unprivileged user namespaces Chrome's sandbox needs.
			...(process.env.CI ? ["--no-sandbox"] : []),
			"about:blank",
		],
		{ stdio: ["ignore", "ignore", "pipe"] },
	);
	const port = await new Promise((ok, fail) => {
		let err = "";
		proc.stderr.on("data", (d) => {
			err += d;
			const m = err.match(/ws:\/\/127\.0\.0\.1:(\d+)\//);
			if (m) ok(m[1]);
		});
		proc.on("exit", () => fail(new Error(`chrome exited: ${err}`)));
	});
	const [page] = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter(
		(t) => t.type === "page",
	);
	const ws = new WebSocket(page.webSocketDebuggerUrl);
	await new Promise((r) => ws.addEventListener("open", r, { once: true }));
	let id = 0;
	const pending = new Map();
	const listeners = new Map();
	ws.addEventListener("message", ({ data }) => {
		const msg = JSON.parse(data);
		if (msg.id) {
			const p = pending.get(msg.id);
			pending.delete(msg.id);
			msg.error ? p.fail(new Error(JSON.stringify(msg.error))) : p.ok(msg.result);
		} else for (const f of listeners.get(msg.method) ?? []) f(msg.params);
	});
	const send = (method, params = {}) =>
		new Promise((ok, fail) => {
			pending.set(++id, { ok, fail });
			ws.send(JSON.stringify({ id, method, params }));
		});
	const on = (method, f) => listeners.set(method, [...(listeners.get(method) ?? []), f]);

	await send("Page.enable");
	await send("Runtime.enable");
	await send("Emulation.setDeviceMetricsOverride", {
		width: W,
		height: H,
		deviceScaleFactor: 1,
		mobile: false,
	});

	const evaluate = async (expression) => {
		const r = await send("Runtime.evaluate", {
			expression,
			awaitPromise: true,
			returnByValue: true,
		});
		if (r.exceptionDetails) throw new Error(`${expression}: ${r.exceptionDetails.text}`);
		return r.result.value;
	};
	const goto = async (url) => {
		const loaded = new Promise((r) => on("Page.loadEventFired", r));
		await send("Page.navigate", { url });
		await loaded;
	};
	/** Polls a JS expression until it is truthy. */
	const waitFor = async (expression, timeout = 30_000) => {
		const end = Date.now() + timeout;
		while (Date.now() < end) {
			if (await evaluate(`!!(${expression})`).catch(() => false)) return;
			await sleep(250);
		}
		throw new Error(`timed out: ${expression}`);
	};
	/** Clicks the first element matching a selector whose text includes `text`, after a white
	 *  outline marks it for a moment (headless Chrome draws no cursor). */
	const click = (selector, text = "") =>
		evaluate(`new Promise((done, fail) => {
			const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
				.find((e) => e.textContent.includes(${JSON.stringify(text)}));
			if (!el) return fail(new Error("no element"));
			el.style.outline = "4px solid #fff";
			el.style.outlineOffset = "4px";
			setTimeout(() => {
				el.style.outline = "";
				el.click();
				done(true);
			}, 700);
		})`);
	/** Smooth scroll by `dy` pixels over `ms`. */
	const scroll = (dy, ms) =>
		evaluate(`new Promise((done) => {
			const y0 = scrollY, t0 = performance.now();
			const step = (t) => {
				const k = Math.min(1, (t - t0) / ${ms});
				scrollTo(0, y0 + ${dy} * (0.5 - Math.cos(Math.PI * k) / 2));
				k < 1 ? requestAnimationFrame(step) : done(true);
			};
			requestAnimationFrame(step);
		})`);

	/** Starts a 30 fps recording into `out` (mp4). Returns stop(). */
	const record = async (out) => {
		const ff = spawn(
			"ffmpeg",
			[
				"-y",
				"-loglevel",
				"error",
				"-f",
				"image2pipe",
				"-framerate",
				"30",
				"-c:v",
				"mjpeg",
				"-i",
				"-",
				"-vf",
				`scale=${W}:${H}:flags=lanczos,format=yuv420p`,
				"-c:v",
				"libx264",
				"-preset",
				"veryfast",
				"-crf",
				"16",
				out,
			],
			{ stdio: ["pipe", "inherit", "inherit"] },
		);
		let last = null;
		on("Page.screencastFrame", ({ data, sessionId }) => {
			last = Buffer.from(data, "base64");
			send("Page.screencastFrameAck", { sessionId }).catch(() => undefined);
		});
		await send("Page.startScreencast", {
			format: "jpeg",
			quality: 92,
			maxWidth: W,
			maxHeight: H,
		});
		const t0 = Date.now();
		let written = 0;
		const timer = setInterval(() => {
			const due = Math.floor(((Date.now() - t0) * 30) / 1000);
			for (; last && written < due; written++) ff.stdin.write(last);
		}, 10);
		return async () => {
			clearInterval(timer);
			await send("Page.stopScreencast");
			listeners.delete("Page.screencastFrame");
			ff.stdin.end();
			await new Promise((r) => ff.on("exit", r));
			return written / 30;
		};
	};

	const close = () => {
		ws.close();
		proc.kill();
	};
	return { send, on, evaluate, goto, waitFor, click, scroll, record, close };
}

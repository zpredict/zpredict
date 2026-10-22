// The relayer HTTP client shared by orders, balances and withdrawals.

/** The three relayer base URLs, in party order. */
export type Relayers = readonly [string, string, string];

export async function call<T>(url: string, init?: RequestInit): Promise<T> {
	const r = await fetch(url, {
		...init,
		credentials: "omit",
		referrerPolicy: "no-referrer",
	});
	if (!r.ok) throw new Error(`${r.status} from ${url}`);
	return r.json() as Promise<T>;
}

export const at = (base: string, path: string) => base.replace(/\/+$/, "") + path;

/** Refuses to run unless the three relayers are three different origins. */
export function distinct(relayers: Relayers) {
	if (new Set(relayers.map((u) => new URL(u).origin)).size !== 3) {
		throw new Error("relayers must be three distinct origins");
	}
}

/** POSTs `bodies[i]` as JSON to relayer i only. */
export function postEach<T>(relayers: Relayers, path: string, bodies: readonly unknown[]) {
	return Promise.all(
		bodies.map((body, i) =>
			call<T>(at(relayers[i], path), {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			}),
		),
	);
}

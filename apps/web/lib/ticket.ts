import { HALF_TICKS_PER_UNIT, MAX_SIZE, ZATS_PER_HALF_TICK } from "@zpredict/sdk";

/** Half-ticks one share pays if its side wins: 200 = 0.01 ZEC. */
export const PAYOUT = Number(HALF_TICKS_PER_UNIT);

/** A ZEC amount to half-ticks, rounded down (1 half-tick = 0.00005 ZEC); not a positive number → 0. */
export const zecToHalfTicks = (amount: number) =>
	Number.isFinite(amount) && amount > 0
		? Math.floor(Math.round(amount * 1e8) / Number(ZATS_PER_HALF_TICK))
		: 0;

/**
 * What `amount` ZEC buys at limit `price`¢: one share costs 2 × price half-ticks (price% of
 * 0.01 ZEC, what the relayers reserve) and pays 200. Whole shares only, so `cost` ≤ the amount;
 * the fill is at the batch midpoint, never above the limit. Half-ticks throughout.
 */
export function quote(amount: number, price: number) {
	const each = 2 * price;
	const shares = Math.min(MAX_SIZE, Math.floor(zecToHalfTicks(amount) / each));
	return { each, shares, cost: shares * each, payout: shares * PAYOUT };
}

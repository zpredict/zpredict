/**
 * "Public vs private": what an explorer shows for a public prediction market,
 * next to what the chain shows for zPredict. Wallets are generic placeholders.
 */
export interface PublicTrade {
	wallet: string;
	side: "YES" | "NO";
	size: string;
	price: string;
	time: string;
}

export const publicTrades: PublicTrade[] = [
	{ wallet: "0x7a3f…91c2", side: "YES", size: "$12,400", price: "62¢", time: "2 min ago" },
	{ wallet: "0x19be…04d7", side: "NO", size: "$3,150", price: "38¢", time: "6 min ago" },
	{ wallet: "0x7a3f…91c2", side: "YES", size: "$8,000", price: "63¢", time: "11 min ago" },
	{ wallet: "0xc4e0…7b1a", side: "YES", size: "$950", price: "61¢", time: "18 min ago" },
];

export interface ShieldedField {
	label: string;
	value: string;
}

/** One batched zPredict settlement as a block explorer sees it. */
export const shieldedTx: ShieldedField[] = [
	{ label: "Transaction", value: "e3b0c442…b855" },
	{ label: "Pool", value: "Ironwood (shielded)" },
	{ label: "Inputs", value: "encrypted" },
	{ label: "Outputs", value: "encrypted" },
	{ label: "Amounts", value: "hidden" },
	{ label: "Memo", value: "encrypted" },
];

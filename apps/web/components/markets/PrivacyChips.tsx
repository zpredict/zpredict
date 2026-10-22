/** What a public market can't show, by design, plus how it resolves. */
export default function PrivacyChips() {
	return (
		<footer className="mmeta">
			<span
				className="mmeta__chip"
				title="No relayer, chain observer or counterparty learns who bet"
			>
				Bettors: hidden
			</span>
			<span
				className="mmeta__chip"
				title="Orders are secret-shared; only the clearing price is public"
			>
				Sizes: hidden
			</span>
			<span className="mmeta__badge">Resolved from chain data</span>
		</footer>
	);
}

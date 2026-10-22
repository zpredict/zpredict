/**
 * Phones only: a static lede above the split. It sits outside TradeScreen's Suspense boundary
 * (useSearchParams renders on the client), so it is in the HTML and is the page's early LCP.
 */
export default function TradeIntro() {
	return (
		<p className="trade__intro">
			Your order leaves this browser as three random shares, one per relayer. None of them can read
			it.
		</p>
	);
}

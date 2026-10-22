export default function RelayersDown() {
	return (
		<p className="note">
			Relayers unreachable. Running locally? Start the mock relayers with{" "}
			<code>pnpm --filter @zpredict/web dev:mock</code>.
		</p>
	);
}

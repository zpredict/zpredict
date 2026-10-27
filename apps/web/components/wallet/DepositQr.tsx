import { qrModules, qrPath } from "@/lib/qr";

/** The ZIP 321 request as a QR code, made in this browser: scan it with a phone wallet. */
export default function DepositQr({ uri }: { uri: string }) {
	const m = qrModules(uri);
	return (
		<figure className="qr">
			<svg
				aria-label="QR code of the payment request"
				className="qr__svg"
				role="img"
				shapeRendering="crispEdges"
				viewBox={`0 0 ${m.length} ${m.length}`}
			>
				<rect fill="#fff" height={m.length} width={m.length} />
				<path d={qrPath(m)} fill="#080a04" />
			</svg>
			<figcaption className="dim">Scan with a testnet wallet.</figcaption>
		</figure>
	);
}

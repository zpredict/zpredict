import { bytes, ORDER_FIELDS } from "@/lib/format";

interface Props {
	hex: string | null;
	/** Group bytes by the order layout and caption each field. */
	fields?: boolean;
}

/** Hex rendered as byte groups; placeholders while a share hasn't arrived. */
export default function HexBytes({ hex, fields = false }: Props) {
	const b = hex ? bytes(hex) : Array.from({ length: 18 }, () => "··");
	return (
		<span className="hexbytes">
			{ORDER_FIELDS.map((f) => (
				<span className={`hexbytes__group f-${f.name}`} key={f.name}>
					<span className="hexbytes__bytes">{b.slice(f.from, f.to).join(" ")}</span>
					{fields && <span className="hexbytes__label">{f.name}</span>}
				</span>
			))}
		</span>
	);
}

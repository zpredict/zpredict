import Badge from "@/components/ui/Badge";

interface Props {
	on: boolean;
	onChange: (on: boolean) => void;
	sideName: string;
	otherSide: string;
}

/** DEMO (#103): place the exact opposite order from the same judge account, a labelled self-trade. */
export default function CounterpartyToggle({ on, onChange, sideName, otherSide }: Props) {
	return (
		<div className="counter">
			<label className="counter__row" htmlFor="counterparty">
				<input
					aria-describedby="counterparty-help"
					checked={on}
					id="counterparty"
					onChange={(e) => onChange(e.target.checked)}
					type="checkbox"
				/>
				<span>Take the other side (demo)</span>
				<Badge tone="mock">Mock</Badge>
			</label>
			<p className="counter__help" id="counterparty-help">
				Demo only: your browser also places the opposite order ({otherSide} at 100 − your price)
				from your own demo account, so the two fill against each other: you trade with yourself and
				your balance nets out at resolution. Real markets need another trader taking {otherSide}{" "}
				against your {sideName} in the same batch.
			</p>
		</div>
	);
}

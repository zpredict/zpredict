import type { Side } from "@zpredict/sdk";

interface Props {
	side: Side;
	onChange: (s: Side) => void;
}

const SIDES = [
	{ value: 0, label: "Yes" },
	{ value: 1, label: "No" },
] as const;

/** YES / NO as a native radio group styled as two big buttons. */
export default function SideToggle({ side, onChange }: Props) {
	return (
		<fieldset className="sides">
			<legend className="sr-only">Side</legend>
			{SIDES.map((s) => (
				<label
					className={`side side--${s.label.toLowerCase()}${side === s.value ? " is-on" : ""}`}
					key={s.value}
				>
					<input
						checked={side === s.value}
						name="side"
						onChange={() => onChange(s.value)}
						type="radio"
						value={s.value}
					/>
					{s.label}
				</label>
			))}
		</fieldset>
	);
}

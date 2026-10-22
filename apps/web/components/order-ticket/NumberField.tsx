interface Props {
	id: string;
	label: string;
	unit: string;
	value: number;
	min: number;
	max: number;
	onChange: (v: number) => void;
}

/** Labelled whole-number input with a unit suffix. */
export default function NumberField({ id, label, unit, value, min, max, onChange }: Props) {
	return (
		<label className="field" htmlFor={id}>
			<span className="field__label">{label}</span>
			<span className="field__box">
				<input
					id={id}
					inputMode="numeric"
					max={max}
					min={min}
					onChange={(e) => onChange(e.target.valueAsNumber)}
					step={1}
					type="number"
					value={Number.isNaN(value) ? "" : value}
				/>
				<span className="field__unit">{unit}</span>
			</span>
		</label>
	);
}

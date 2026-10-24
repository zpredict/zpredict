interface Props {
	id: string;
	label: string;
	unit: string;
	value: number;
	min: number;
	max?: number;
	/** 1 = whole numbers; anything else takes decimals (a ZEC amount). */
	step?: number;
	onChange: (v: number) => void;
}

/** Labelled number input with a unit suffix. */
export default function NumberField({
	id,
	label,
	unit,
	value,
	min,
	max,
	step = 1,
	onChange,
}: Props) {
	return (
		<label className="field" htmlFor={id}>
			<span className="field__label">{label}</span>
			<span className="field__box">
				<input
					id={id}
					inputMode={step === 1 ? "numeric" : "decimal"}
					max={max}
					min={min}
					onChange={(e) => onChange(e.target.valueAsNumber)}
					step={step}
					type="number"
					value={Number.isNaN(value) ? "" : value}
				/>
				<span className="field__unit">{unit}</span>
			</span>
		</label>
	);
}

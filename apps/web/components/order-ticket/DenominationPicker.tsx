import { DENOMINATIONS, type Denomination, unitsToZec } from "@zpredict/sdk";
import ZecIcon from "@/components/ui/ZecIcon";

interface Props {
	units: Denomination;
	onChange: (u: Denomination) => void;
	/** Radio group name and legend: one per form, so two pickers on a page stay apart. */
	name?: string;
	legend?: string;
}

/** The three deposit sizes (0.01, 0.05, 0.25 ZEC) as a native radio group. */
export default function DenominationPicker({
	units,
	onChange,
	name = "denomination",
	legend = "Deposit size",
}: Props) {
	return (
		<fieldset className="denoms">
			<legend className="sr-only">{legend}</legend>
			{DENOMINATIONS.map((d) => (
				<label className={`denom num${units === d ? " is-on" : ""}`} key={d}>
					<input
						checked={units === d}
						name={name}
						onChange={() => onChange(d)}
						type="radio"
						value={d}
					/>
					<span>
						<ZecIcon /> {unitsToZec(d)} ZEC
					</span>
				</label>
			))}
		</fieldset>
	);
}

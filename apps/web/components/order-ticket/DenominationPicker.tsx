import { DENOMINATIONS, type Denomination, unitsToZec } from "@zpredict/sdk";
import ZecIcon from "@/components/ui/ZecIcon";

interface Props {
	units: Denomination;
	onChange: (u: Denomination) => void;
}

/** The three deposit sizes as a native radio group. */
export default function DenominationPicker({ units, onChange }: Props) {
	return (
		<fieldset className="denoms">
			<legend className="sr-only">Deposit size</legend>
			{DENOMINATIONS.map((d) => (
				<label className={`denom${units === d ? " is-on" : ""}`} key={d}>
					<input
						checked={units === d}
						name="denomination"
						onChange={() => onChange(d)}
						type="radio"
						value={d}
					/>
					{d} unit{d > 1 ? "s" : ""}
					<span className="dim">
						<ZecIcon /> {unitsToZec(d)} ZEC
					</span>
				</label>
			))}
		</fieldset>
	);
}

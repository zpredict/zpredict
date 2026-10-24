"use client";
import { DENOMINATIONS, type Denomination } from "@zpredict/sdk";
import { useState } from "react";
import DenominationPicker from "@/components/order-ticket/DenominationPicker";
import NumberField from "@/components/order-ticket/NumberField";

interface Props {
	value: number;
	max: number;
	onChange: (units: number) => void;
}

const isDenomination = (n: number): n is Denomination =>
	(DENOMINATIONS as readonly number[]).includes(n);

/**
 * The withdrawal amount: one of the deposit sizes, so it is common at the relayers (#91).
 * Any other amount is close to unique there, so it needs an explicit opt-in.
 */
export default function WithdrawAmount({ value, max, onChange }: Props) {
	const [distinct, setDistinct] = useState(false);
	const toggle = (on: boolean) => {
		setDistinct(on);
		if (!on && !isDenomination(value)) onChange(1);
	};
	return (
		<>
			{distinct ? (
				<NumberField
					id="withdraw-units"
					label="Amount"
					max={max}
					min={1}
					onChange={onChange}
					unit="units"
					value={value}
				/>
			) : (
				<DenominationPicker
					legend="Withdrawal size"
					name="withdraw-denomination"
					onChange={onChange}
					units={isDenomination(value) ? value : 1}
				/>
			)}
			<label className="counter__row" htmlFor="withdraw-distinct">
				<input
					checked={distinct}
					id="withdraw-distinct"
					onChange={(e) => toggle(e.target.checked)}
					type="checkbox"
				/>
				<span>I understand this amount is distinctive</span>
			</label>
		</>
	);
}

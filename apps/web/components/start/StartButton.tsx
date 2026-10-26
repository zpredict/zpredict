"use client";
import Cta from "@/components/ui/Cta";
import { useJudge } from "@/hooks/useJudge";

/** Compact judge-mode CTA: "Judge mode" until there is a demo account, then "Trade now". */
export default function JudgeButton() {
	const { start, busy, error, label } = useJudge();
	return (
		<Cta disabled={busy} onClick={start}>
			{error || label}
		</Cta>
	);
}

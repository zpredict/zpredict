"use client";
import Button from "@/components/ui/Button";
import { useJudge } from "@/hooks/useJudge";

/** Compact judge-mode button for the top bar. */
export default function JudgeButton() {
	const { start, busy, error, label } = useJudge();
	return (
		<Button disabled={busy} onClick={start}>
			{error || label}
		</Button>
	);
}

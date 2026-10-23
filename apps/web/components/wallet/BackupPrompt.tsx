"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "@/hooks/useAccount";
import { KEYS, load } from "@/lib/storage";

/** After the first real deposit lands: back up the key, or losing this browser loses the balance. */
export default function BackupPrompt() {
	const { tag, mock, balance } = useAccount();
	const [done, setDone] = useState(true);
	// localStorage isn't reactive: re-read whenever the account or its balance changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the deps are the re-read triggers
	useEffect(() => setDone(load(KEYS.backup) !== null), [tag, balance]);
	if (!tag || mock !== false || !balance || done) return null;
	return (
		<p className="bprompt" role="status">
			<strong>Back up your account key.</strong> Your balance lives only behind the key in this
			browser. <Link href="/wallet/#backup">Back it up now →</Link>
		</p>
	);
}

"use client";
import { useState } from "react";
import Button from "./Button";

/** Copies `text` to the clipboard and says so for a moment. */
export default function CopyButton({ text, label }: { text: string; label: string }) {
	const [done, setDone] = useState(false);
	const copy = async () => {
		await navigator.clipboard.writeText(text);
		setDone(true);
		setTimeout(() => setDone(false), 1500);
	};
	return (
		<Button aria-live="polite" onClick={copy} variant="ghost">
			{done ? "Copied" : label}
		</Button>
	);
}

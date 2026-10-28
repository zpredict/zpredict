"use client";
import { type RefObject, useEffect } from "react";

/** Closes a popup on Escape or a press outside `ref`, while `open`. */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
	useEffect(() => {
		if (!open) return;
		const onEvent = (e: MouseEvent | KeyboardEvent) => {
			if (
				e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)
			)
				close();
		};
		document.addEventListener("mousedown", onEvent);
		document.addEventListener("keydown", onEvent);
		return () => {
			document.removeEventListener("mousedown", onEvent);
			document.removeEventListener("keydown", onEvent);
		};
	}, [ref, open, close]);
}

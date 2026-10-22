"use client";
import { type RefObject, useEffect } from "react";
import { scrambler } from "@/lib/scramble";

/**
 * Scrambles every `[data-scramble]` element inside `ref` when it is hovered with a mouse or
 * focused from the keyboard (never on touch). `hover`: continuous while hovered, settles on
 * leave with lines staggered 80 ms (headings). `once`: one pass on enter (CTAs).
 * `text` must change whenever the scrambled text does, so the scramblers are rebuilt.
 */
export function useScramble(ref: RefObject<HTMLElement | null>, mode: "hover" | "once", text = "") {
	// biome-ignore lint/correctness/useExhaustiveDependencies: `text` is the trigger to rebuild
	useEffect(() => {
		const root = ref.current;
		if (!root) return;
		const lines = [...root.querySelectorAll<HTMLElement>("[data-scramble]")].map((el) =>
			scrambler(el, el.textContent ?? ""),
		);
		const enter = (e: Event) => {
			if (e instanceof PointerEvent && e.pointerType !== "mouse") return;
			if (e.type === "focusin" && !(e.target as Element).matches(":focus-visible")) return;
			for (const s of lines) mode === "once" ? s.once() : s.hold();
		};
		const leave = () => {
			if (mode === "hover") for (const [i, s] of lines.entries()) s.settle(i * 80);
		};
		const on = [
			["pointerenter", enter],
			["pointerleave", leave],
			["focusin", enter],
			["focusout", leave],
		] as const;
		for (const [type, fn] of on) root.addEventListener(type, fn);
		return () => {
			for (const [type, fn] of on) root.removeEventListener(type, fn);
			for (const s of lines) s.cancel();
		};
	}, [ref, mode, text]);
}

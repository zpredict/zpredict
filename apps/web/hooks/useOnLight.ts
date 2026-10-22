"use client";
import { usePathname } from "next/navigation";
import { type RefObject, useEffect, useState } from "react";

/** True while the middle of `ref` sits over a light (`[data-surface="light"]`) section. */
export function useOnLight(ref: RefObject<HTMLElement | null>) {
	const [light, setLight] = useState(false);
	const path = usePathname();
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-check when the route changes
	useEffect(() => {
		let raf = 0;
		const check = () => {
			raf = 0;
			const el = ref.current;
			if (!el) return;
			const r = el.getBoundingClientRect();
			const y = r.top + r.height / 2;
			const over = [...document.querySelectorAll('[data-surface="light"]')].some((s) => {
				const b = s.getBoundingClientRect();
				return b.top <= y && b.bottom >= y;
			});
			setLight(over);
		};
		const schedule = () => {
			raf ||= requestAnimationFrame(check);
		};
		check();
		addEventListener("scroll", schedule, { passive: true });
		addEventListener("resize", schedule);
		return () => {
			removeEventListener("scroll", schedule);
			removeEventListener("resize", schedule);
			cancelAnimationFrame(raf);
		};
	}, [ref, path]);
	return light;
}

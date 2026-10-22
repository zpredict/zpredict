"use client";
import Link from "next/link";
import { useRef } from "react";
import JudgeButton from "@/components/judge/JudgeButton";
import Menu from "@/components/menu/Menu";
import { useOnLight } from "@/hooks/useOnLight";
import BalancePill from "./BalancePill";

/** Fixed header: logo, Menu, balance and the judge CTA. Turns dark over lime and paper sections. */
export default function Topbar() {
	const ref = useRef<HTMLElement>(null);
	const light = useOnLight(ref);
	return (
		<header className={`topbar${light ? " is-on-light" : ""}`} ref={ref}>
			<Link aria-label="zPredict home" className="brand" href="/">
				{/* biome-ignore lint/performance/noImgElement: static export has no image optimizer */}
				<img
					alt=""
					className="brand__mark"
					height={36}
					src="/white/android-chrome-192x192.png"
					width={36}
				/>
				<span className="brand__word">zPredict</span>
			</Link>
			<Menu />
			<div className="topbar__right">
				<BalancePill />
				<JudgeButton />
			</div>
		</header>
	);
}

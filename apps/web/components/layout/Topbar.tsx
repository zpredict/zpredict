import Link from "next/link";
import JudgeButton from "@/components/judge/JudgeButton";
import BalancePill from "./BalancePill";
import NavLinks from "./NavLinks";

export default function Topbar() {
	return (
		<header className="topbar">
			<Link aria-label="zPredict home" className="brand" href="/">
				{/* biome-ignore lint/performance/noImgElement: static export has no image optimizer */}
				<img alt="" height={30} src="/white/android-chrome-192x192.png" width={30} />
				<span>zPredict</span>
			</Link>
			<NavLinks />
			<div className="topbar__right">
				<BalancePill />
				<JudgeButton />
			</div>
		</header>
	);
}

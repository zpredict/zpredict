"use client";
import { useEffect, useState } from "react";
import { ANNOUNCEMENT } from "@/lib/announcement";
import { KEYS, load, save } from "@/lib/storage";

/** The dismissible bar above the header; `--announce-h` makes room for it while it shows. */
export default function AnnouncementBar() {
	const a = ANNOUNCEMENT;
	const [open, setOpen] = useState(true);
	useEffect(() => {
		if (ANNOUNCEMENT && load(KEYS.announce) === ANNOUNCEMENT.id) setOpen(false);
	}, []);
	if (!a || !open) return null;
	return (
		<aside aria-label="Announcement" className="announce">
			<p className="announce__text">
				{a.text}
				{a.link && (
					<>
						{" "}
						<a className="announce__link" href={a.link.href}>
							{a.link.label} →
						</a>
					</>
				)}
			</p>
			<button
				aria-label="Dismiss announcement"
				className="announce__close"
				onClick={() => {
					save(KEYS.announce, a.id);
					setOpen(false);
				}}
				type="button"
			>
				×
			</button>
		</aside>
	);
}

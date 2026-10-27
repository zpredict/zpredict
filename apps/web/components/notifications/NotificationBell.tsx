"use client";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { useDismiss } from "@/hooks/useDismiss";
import { useNotifications } from "@/hooks/useNotifications";

const AGO = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
function ago(at: number) {
	const s = Math.round((at - Date.now()) / 1000);
	if (s > -60) return "just now";
	if (s > -3600) return AGO.format(Math.round(s / 60), "minute");
	if (s > -86400) return AGO.format(Math.round(s / 3600), "hour");
	return AGO.format(Math.round(s / 86400), "day");
}

/** What the system-notification switch says for each browser permission. */
function SystemSwitch() {
	const { permission, enableSystem } = useNotifications();
	if (permission === "granted")
		return <p className="dim">Desktop alerts on while this tab is in the background.</p>;
	if (permission === "denied")
		return <p className="dim">Desktop alerts are blocked in this browser's site settings.</p>;
	if (permission === "unsupported") return null;
	return (
		<button className="notes__enable" onClick={enableSystem} type="button">
			Enable desktop alerts
		</button>
	);
}

/**
 * The bell: fills, misses, resolutions and credits, worked out in this browser (lib/notify.ts).
 * Opening it marks everything read.
 */
export default function NotificationBell() {
	const { notes, unread, markRead } = useNotifications();
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const close = useCallback(() => setOpen(false), []);
	useDismiss(ref, open, close);
	return (
		<div className="notes" ref={ref}>
			<button
				aria-expanded={open}
				aria-haspopup="dialog"
				aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
				className="notes__bell"
				onClick={() => {
					if (!open) markRead();
					setOpen(!open);
				}}
				type="button"
			>
				<svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
					<path
						d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.8"
					/>
				</svg>
				{unread > 0 && <span className="notes__badge num">{unread > 9 ? "9+" : unread}</span>}
			</button>
			{open && (
				<div aria-label="Notifications" className="notes__panel" role="dialog">
					<p className="notes__title">Notifications</p>
					{notes.length === 0 ? (
						<p className="notes__empty dim">
							Fills, resolutions and deposits show up here. Worked out in this browser; nothing is
							sent anywhere.
						</p>
					) : (
						<ul className="notes__list">
							{notes.map((n) => (
								<li key={n.id}>
									<Link href={n.href} onClick={close}>
										<span className="notes__head">
											<b>{n.title}</b>
											<span className="dim">{ago(n.at)}</span>
										</span>
										<span className="notes__body">{n.body}</span>
									</Link>
								</li>
							))}
						</ul>
					)}
					<div className="notes__foot">
						<SystemSwitch />
					</div>
				</div>
			)}
		</div>
	);
}

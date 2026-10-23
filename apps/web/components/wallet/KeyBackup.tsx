"use client";
import { exportKey, importKey } from "@zpredict/sdk";
import { useState } from "react";
import Button from "@/components/ui/Button";
import CopyButton from "@/components/ui/CopyButton";
import { useAccount } from "@/hooks/useAccount";
import { KEYS, save } from "@/lib/storage";

/**
 * Back up the account key (the tag) to use the account on another device, or restore one here.
 * The key never leaves the browser unless you copy or save it.
 */
export default function KeyBackup() {
	const { tag, restore } = useAccount();
	const [shown, setShown] = useState(false);
	const [input, setInput] = useState("");
	const [msg, setMsg] = useState("");
	const key = tag ? exportKey(tag) : null;
	const saved = () => save(KEYS.backup, "1");

	const download = () => {
		if (!key) return;
		const url = URL.createObjectURL(new Blob([`${key}\n`], { type: "text/plain" }));
		const a = Object.assign(document.createElement("a"), {
			href: url,
			download: "zpredict-key.txt",
		});
		a.click();
		URL.revokeObjectURL(url);
		saved();
	};

	const doImport = (text: string) => {
		const r = importKey(text);
		if ("error" in r) return setMsg(r.error);
		if (tag && r.tag !== tag && !confirm("Replace the account in this browser? Back it up first."))
			return;
		restore(r.tag);
		setInput("");
		setMsg("Account restored in this browser.");
	};

	return (
		<section aria-labelledby="backup-title" className="kbackup" id="backup">
			<h3 className="kbackup__title" id="backup-title">
				Account key
			</h3>
			<p className="kbackup__warn">
				Anyone with this key controls your balance. Nobody can recover it for you: keep a copy
				somewhere safe, never share it.
			</p>
			{key && !shown && (
				<Button className="kbackup__reveal" onClick={() => setShown(true)} variant="ghost">
					Show key to back up
				</Button>
			)}
			{key && shown && (
				<>
					<code className="deposit__ua">{key}</code>
					<span className="deposit__actions" onClickCapture={saved}>
						<CopyButton label="Copy key" text={key} />
						<Button onClick={download} variant="ghost">
							Save as file
						</Button>
					</span>
				</>
			)}
			<label className="field" htmlFor="restore-key">
				<span className="field__label">Restore a key from another device</span>
				<span className="field__box">
					<input
						autoComplete="off"
						id="restore-key"
						onChange={(e) => setInput(e.target.value)}
						placeholder="zpredict-key-1:…"
						spellCheck={false}
						value={input}
					/>
				</span>
			</label>
			<span className="deposit__actions">
				<Button disabled={!input.trim()} onClick={() => doImport(input)} variant="ghost">
					Restore
				</Button>
				<label className="btn btn--ghost kbackup__file">
					Open key file
					<input
						accept=".txt,text/plain"
						className="sr-only"
						onChange={async (e) => {
							const f = e.target.files?.[0];
							if (f) doImport(await f.text());
						}}
						type="file"
					/>
				</label>
			</span>
			{msg && (
				<p aria-live="polite" className="dim">
					{msg}
				</p>
			)}
		</section>
	);
}

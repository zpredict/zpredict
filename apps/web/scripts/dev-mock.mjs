// `pnpm dev:mock`: three mock relayers on :4101-4103 plus `next dev` pointed at them.
import { spawn } from "node:child_process";

const relayers = spawn(process.execPath, ["mock-relayer/src/server.mjs"], {
	stdio: "inherit",
});
const next = spawn("next", ["dev", "-p", "3000"], {
	stdio: "inherit",
	shell: true,
	env: {
		...process.env,
		NEXT_PUBLIC_RELAYERS: "http://localhost:4101,http://localhost:4102,http://localhost:4103",
	},
});
const stop = () => {
	relayers.kill();
	next.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
next.on("exit", stop);

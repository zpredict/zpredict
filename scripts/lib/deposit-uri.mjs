// The deposit request exactly as the web app builds it (@zpredict/sdk), for the scripts.
//   node scripts/lib/deposit-uri.mjs <escrow-ua> <units> <tag-hex> <pk0> <pk1> <pk2>
// Needs `pnpm --filter @zpredict/sdk build` first.
import { depositUri, encodeMemo } from "../../packages/sdk/dist/index.js";

const [escrow, units, tag, ...keys] = process.argv.slice(2);
console.log(depositUri(escrow, Number(units), await encodeMemo(tag, keys)));

/** The ZEC token mark, same shapes as packages/brand/zec/zec.svg (a test keeps them equal). */
export const ZEC_FILL = "#F4B728";
export const ZEC_PATH = "M157 67h30v30h49v33l-78 86h78v33h-49v27h-30v-27h-50v-35l77-84h-77v-33h50z";

/**
 * Decorative ZEC icon, inline (no request), sized by the text around it. Always sits beside
 * the word "ZEC", so it is hidden from assistive tech. It marks the currency only: zPredict is
 * not affiliated with the Electric Coin Company or the Zcash Foundation.
 */
export default function ZecIcon({ className = "" }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			className={`zec-icon ${className}`}
			focusable="false"
			viewBox="0 0 346 346"
		>
			<circle cx="173" cy="173" fill={ZEC_FILL} r="173" />
			<path d={ZEC_PATH} fill="#fff" />
		</svg>
	);
}

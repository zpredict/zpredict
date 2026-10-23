import { ogImage } from "@/components/og-image";

export const revalidate = false;

export const GET = () =>
	ogImage("Price public. Participants private.", "Shielded prediction market on Zcash.");

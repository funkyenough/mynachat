import { Space_Grotesk, Zen_Kaku_Gothic_New } from "next/font/google";

/** Japanese display face for headings (exposed as --font-display). */
export const display = Zen_Kaku_Gothic_New({ weight: ["700", "900"], subsets: ["latin"], preload: false, variable: "--font-display" });

/** Squarer Latin face for headings, listed first so Japanese falls through to Zen Kaku (--font-display-latin). */
export const displayLatin = Space_Grotesk({ weight: ["500", "700"], subsets: ["latin"], variable: "--font-display-latin" });

/** Class names that expose both heading faces to CSS. */
export const headingFonts = `${display.variable} ${displayLatin.variable}`;

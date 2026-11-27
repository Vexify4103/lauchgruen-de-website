import { Nanum_Brush_Script, Noto_Serif_KR } from "next/font/google";

// Korean display fonts for the ninja style. Google ships the Hangul glyphs as
// unicode-range chunks, so the browser only downloads the characters in use.
export const serifKr = Noto_Serif_KR({ weight: "variable", subsets: ["latin"], preload: false, display: "block" });
export const brushScript = Nanum_Brush_Script({ weight: "400", subsets: ["latin"], preload: false, display: "block" });

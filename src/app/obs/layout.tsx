/**
 * Layout for OBS browser-source routes.
 *
 * Forces a transparent background so OBS sees only the widget — no body
 * gradient bleed-through. Also strips any default margins/padding and keeps
 * the overlays on their original font so existing OBS scenes do not reflow.
 */
export default function ObsLayout({ children }: { children: React.ReactNode }) {
	return (
		<>
			<style>{`
        html, body {
          background: transparent !important;
          margin: 0 !important;
          padding: 0 !important;
          font-family: "Trebuchet MS", "Segoe UI", Arial, sans-serif !important;
        }
        h1, h2, h3 {
          font-family: inherit;
        }
      `}</style>
			{children}
		</>
	);
}

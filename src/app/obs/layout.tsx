/**
 * Layout for OBS browser-source routes.
 *
 * Forces a transparent background so OBS sees only the widget — no body
 * gradient bleed-through. Also strips any default margins/padding.
 */
export default function ObsLayout({ children }: { children: React.ReactNode }) {
	return (
		<>
			<style>{`
        html, body {
          background: transparent !important;
          margin: 0 !important;
          padding: 0 !important;
        }
      `}</style>
			{children}
		</>
	);
}

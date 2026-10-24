/** Shared styles for the TLG Fabi A-Z overlay (plain CSS, prefixed `azf-`). */
export const LEAVE_MS = 460;

export const BASE_CSS = `
.azf-root {
	--gold: #f6c453; --gold-soft: #ffe3a1; --win: #5eead4; --loss: #fb7185;
	--ink: #f5f3ee; --muted: rgba(245,243,238,.62); --line: rgba(255,255,255,.09);
	position: relative; padding: 16px; width: 712px; transform-origin: top left;
	color: var(--ink); pointer-events: none; font-variant-numeric: tabular-nums;
}
.azf-panel {
	position: relative; width: 680px; height: 264px; overflow: hidden; border-radius: 22px;
	background:
		radial-gradient(120% 140% at 0% 0%, rgba(246,196,83,.13), transparent 52%),
		linear-gradient(140deg, rgba(17,18,28,.94), rgba(8,9,14,.9));
	border: 1px solid rgba(246,196,83,.24);
	box-shadow: 0 22px 60px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.07);
	animation: azf-panel-in 800ms cubic-bezier(.16,.84,.2,1) both;
}
.azf-panel::before {
	content: ""; position: absolute; inset: 0 0 auto 0; height: 2px;
	background: linear-gradient(90deg, transparent, var(--gold), var(--gold-soft), var(--gold), transparent);
	opacity: .85;
}
.azf-watermark {
	position: absolute; right: -18px; bottom: -64px; font-size: 300px; font-weight: 900; line-height: 1;
	color: transparent; -webkit-text-stroke: 2px rgba(246,196,83,.09); letter-spacing: -.06em;
	animation: azf-watermark-in 1.2s cubic-bezier(.16,.84,.2,1) both, azf-float 9s ease-in-out 1.2s infinite;
}
.azf-sweep {
	position: absolute; top: 0; bottom: 0; left: 0; width: 34%; z-index: 5;
	background: linear-gradient(90deg, transparent, rgba(255,227,161,.16), transparent);
	animation: azf-sweep 1.1s cubic-bezier(.4,0,.2,1) both;
}

.azf-header { position: relative; z-index: 2; display: flex; align-items: center; justify-content: space-between; padding: 14px 20px 0; height: 52px; box-sizing: border-box; }
.azf-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
.azf-mark {
	display: flex; gap: 1px; align-items: center; justify-content: center; width: 54px; height: 34px; border-radius: 10px;
	background: linear-gradient(135deg, var(--gold-soft), var(--gold) 55%, #c98b1c);
	color: #1b1406; font-weight: 900; font-size: 16px; letter-spacing: -.02em;
	box-shadow: 0 0 18px rgba(246,196,83,.45), inset 0 1px 0 rgba(255,255,255,.6);
}
.azf-mark span { opacity: .55; font-size: 14px; }
.azf-kicker { font-size: 10.5px; font-weight: 900; text-transform: uppercase; letter-spacing: .2em; color: var(--gold); }
.azf-title { display: flex; align-items: center; gap: 8px; margin-top: 1px; font-size: 18px; font-weight: 900; letter-spacing: -.02em; white-space: nowrap; }
.azf-day { font-size: 11px; font-weight: 800; color: var(--muted); letter-spacing: .06em; text-transform: uppercase; }
.azf-live {
	display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 999px;
	background: rgba(251,113,133,.16); border: 1px solid rgba(251,113,133,.45);
	font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: .1em; color: #ffd0d8;
}
.azf-live i { width: 7px; height: 7px; border-radius: 50%; background: var(--loss); box-shadow: 0 0 10px var(--loss); animation: azf-blink 1.4s ease-in-out infinite; }
.azf-sync { font-size: 10px; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: .1em; animation: azf-blink 1.6s ease-in-out infinite; }
.azf-score { text-align: right; }
.azf-count { font-size: 26px; font-weight: 900; line-height: 1; letter-spacing: -.04em; }
.azf-count b { color: var(--gold); text-shadow: 0 0 18px rgba(246,196,83,.45); }
.azf-count span { color: var(--muted); font-size: 16px; }
.azf-dots { display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-top: 5px; }
.azf-dots span { position: relative; width: 14px; height: 3px; border-radius: 2px; background: rgba(255,255,255,.18); overflow: hidden; transition: width .4s ease; }
.azf-dots span.is-active { width: 26px; }
.azf-dots span i { position: absolute; inset: 0; background: var(--gold); transform-origin: left; animation: azf-timer linear both; }
.azf-dots em { font-style: normal; margin-left: 6px; font-size: 11px; font-weight: 900; color: var(--muted); }

.azf-stage { position: relative; z-index: 2; height: 160px; }
.azf-scene { position: absolute; inset: 0 20px; display: flex; align-items: center; animation: azf-scene-in 700ms cubic-bezier(.16,.84,.2,1) both; }
.azf-leave { animation: azf-leave ${LEAVE_MS}ms cubic-bezier(.6,0,.8,.2) forwards; }
.azf-rise { animation: azf-rise 640ms cubic-bezier(.16,.84,.2,1) both; animation-delay: calc(var(--d, 0) * 75ms + 140ms); }

.azf-main { min-width: 0; flex: 1; }
.azf-name { display: flex; align-items: center; gap: 10px; margin-top: 2px; font-size: 34px; font-weight: 900; line-height: 1.05; letter-spacing: -.035em; white-space: nowrap; text-shadow: 0 2px 14px rgba(0,0,0,.8); }
.azf-sub { margin-top: 6px; font-size: 14px; font-weight: 800; color: var(--muted); }
.azf-tag { padding: 3px 8px; border-radius: 7px; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; background: rgba(255,255,255,.1); color: var(--ink); }
.azf-tag.is-gold { background: var(--gold); color: #1b1406; box-shadow: 0 0 14px rgba(246,196,83,.5); }

.azf-hunt, .azf-last { position: relative; display: flex; align-items: center; gap: 22px; width: 100%; }
.azf-splash {
	position: absolute; top: -60px; bottom: -40px; right: -20px; width: 62%; z-index: -1;
	background-size: cover; background-position: center 20%; opacity: .42;
	-webkit-mask-image: linear-gradient(90deg, transparent, #000 45%, #000 70%, transparent);
	mask-image: linear-gradient(90deg, transparent, #000 45%, #000 70%, transparent);
	animation: azf-ken 16s ease-out both;
}
.azf-chips { display: flex; gap: 6px; margin-top: 9px; }
.azf-chip { padding: 4px 9px; border-radius: 8px; background: rgba(255,255,255,.08); border: 1px solid var(--line); font-size: 12px; font-weight: 900; white-space: nowrap; }
.azf-chip.is-gold { background: linear-gradient(135deg, var(--gold-soft), var(--gold)); color: #1b1406; border-color: transparent; box-shadow: 0 0 16px rgba(246,196,83,.35); }
.azf-chip.is-dim { color: var(--muted); }
.azf-pips { display: flex; gap: 4px; margin-top: 10px; }
.azf-pip { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; width: 26px; height: 30px; border-radius: 6px; font-size: 11px; line-height: 1; font-weight: 900; background: rgba(255,255,255,.06); border: 1px solid var(--line); box-sizing: border-box; }
.azf-pip small { font-size: 8px; opacity: .7; }
.azf-pip.is-loss { background: rgba(251,113,133,.16); border-color: rgba(251,113,133,.5); color: #ffd0d8; }
.azf-pip.is-win { background: rgba(94,234,212,.18); border-color: rgba(94,234,212,.55); color: #c9fff5; }
.azf-pip.is-more { width: auto; padding: 0 6px; color: var(--muted); }
.azf-pip.is-next { border: 1px dashed var(--gold); color: var(--gold); animation: azf-pulse 1.8s ease-in-out infinite; }
.azf-next { flex: 0 0 92px; text-align: center; padding: 10px 8px; border-radius: 14px; background: rgba(0,0,0,.35); border: 1px solid var(--line); box-sizing: border-box; }
.azf-next img { display: block; width: 52px; height: 52px; margin: 7px auto 5px; border-radius: 12px; border: 2px solid rgba(255,255,255,.25); filter: saturate(.75); }
.azf-next-name { font-size: 11.5px; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.azf-portrait { position: relative; flex: 0 0 auto; }
@property --azf-angle { syntax: "<angle>"; initial-value: 0deg; inherits: false; }
.azf-ring { position: absolute; inset: -4px; border-radius: 26px; background: conic-gradient(from var(--azf-angle), var(--gold), rgba(246,196,83,.08) 30%, var(--gold-soft) 50%, rgba(246,196,83,.08) 80%, var(--gold)); animation: azf-angle 5s linear infinite; box-shadow: 0 0 22px rgba(246,196,83,.28); }
.azf-portrait.is-win .azf-ring { background: conic-gradient(from var(--azf-angle), var(--win), rgba(94,234,212,.08) 30%, #d6fff7 50%, rgba(94,234,212,.08) 80%, var(--win)); box-shadow: 0 0 22px rgba(94,234,212,.3); }
.azf-portrait-img { position: absolute; inset: 0; border-radius: 22px; overflow: hidden; background: #000; box-shadow: 0 10px 28px rgba(0,0,0,.7); }
.azf-portrait-img img { width: 100%; height: 100%; object-fit: cover; transform: scale(1.08); }
.azf-portrait-badge {
	position: absolute; right: -8px; bottom: -8px; display: grid; place-items: center; min-width: 32px; height: 32px; padding: 0 4px; box-sizing: border-box;
	border-radius: 10px; font-size: 18px; font-weight: 900; color: #1b1406; background: linear-gradient(135deg, var(--gold-soft), var(--gold));
	box-shadow: 0 4px 14px rgba(0,0,0,.6), 0 0 16px rgba(246,196,83,.5);
}
.azf-portrait.is-win .azf-portrait-badge { background: linear-gradient(135deg, #d6fff7, var(--win)); color: #032a24; box-shadow: 0 4px 14px rgba(0,0,0,.6), 0 0 16px rgba(94,234,212,.55); }

.azf-stats { display: flex; gap: 22px; margin-top: 12px; }
.azf-stat-label { font-size: 9.5px; font-weight: 900; text-transform: uppercase; letter-spacing: .14em; color: var(--muted); }
.azf-stat-value { margin-top: 3px; font-size: 19px; font-weight: 900; letter-spacing: -.02em; white-space: nowrap; }
.azf-stat-value.is-accent { color: var(--gold); text-shadow: 0 0 14px rgba(246,196,83,.4); }

.azf-road { width: 100%; }
.azf-trail { display: flex; align-items: flex-end; gap: 10px; margin-top: 10px; }
.azf-stop { width: 58px; text-align: center; }
.azf-stop-icon { position: relative; width: 48px; height: 48px; margin: 0 auto; }
.azf-stop-icon img { width: 100%; height: 100%; border-radius: 12px; object-fit: cover; border: 2px solid rgba(255,255,255,.18); box-sizing: border-box; }
.azf-stop.is-done .azf-stop-icon img { border-color: rgba(94,234,212,.7); filter: saturate(.55) brightness(.85); }
.azf-stop.is-current { width: 82px; }
.azf-stop.is-current .azf-stop-icon { width: 70px; height: 70px; }
.azf-stop.is-current .azf-stop-icon img { border-color: var(--gold); animation: azf-glow 2.2s ease-in-out infinite; }
.azf-stop.is-next .azf-stop-icon img { filter: grayscale(.7) brightness(.8); }
.azf-stop-badge { position: absolute; right: -6px; bottom: -6px; padding: 2px 5px; border-radius: 6px; font-size: 10px; font-weight: 900; background: var(--win); color: #032a24; }
.azf-stop.is-current .azf-stop-badge { background: var(--gold); color: #1b1406; font-size: 12px; }
.azf-stop-name { margin-top: 7px; font-size: 10.5px; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--muted); }
.azf-stop.is-current .azf-stop-name { color: var(--ink); font-size: 12px; }
.azf-road-foot { display: flex; justify-content: space-between; margin-top: 10px; font-size: 12px; font-weight: 800; color: var(--muted); }
.azf-road-foot b { color: var(--ink); }

.azf-alpha { display: flex; align-items: center; gap: 22px; width: 100%; }
.azf-letters { display: grid; grid-template-columns: repeat(13, 28px); gap: 4px; }
.azf-letter { position: relative; height: 44px; border-radius: 7px; overflow: hidden; background: rgba(255,255,255,.05); border: 1px solid var(--line); text-align: center; box-sizing: border-box; }
.azf-letter i { position: absolute; left: 0; right: 0; bottom: 0; height: calc(var(--fill) * 100%); background: linear-gradient(0deg, rgba(246,196,83,.55), rgba(246,196,83,.18)); }
.azf-letter b { position: relative; display: block; margin-top: 6px; font-size: 15px; font-weight: 900; }
.azf-letter small { position: relative; display: block; font-size: 8.5px; font-weight: 800; color: var(--muted); }
.azf-letter.is-done { border-color: rgba(246,196,83,.65); }
.azf-letter.is-done b { color: #1b1406; }
.azf-letter.is-done small { color: rgba(27,20,6,.7); }
.azf-letter.is-done i { background: linear-gradient(0deg, var(--gold), var(--gold-soft)); }
.azf-letter.is-current { border-color: var(--gold); animation: azf-rise 640ms cubic-bezier(.16,.84,.2,1) both, azf-pulse 1.8s ease-in-out 1s infinite; }
.azf-letter.is-current b { color: var(--gold); }
.azf-letter.is-empty { opacity: .3; }
.azf-grid-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px 18px; flex: 1; }
.azf-grid-stats .azf-stat-label { white-space: nowrap; }

.azf-celebrate { position: relative; display: flex; align-items: center; gap: 26px; width: 100%; padding-left: 10px; }
.azf-rays {
	position: absolute; left: -90px; top: 50%; width: 360px; height: 360px; margin-top: -180px; z-index: -1; opacity: .55;
	background: repeating-conic-gradient(from 0deg, rgba(94,234,212,.35) 0deg 8deg, transparent 8deg 22deg);
	-webkit-mask-image: radial-gradient(circle, #000 18%, transparent 62%); mask-image: radial-gradient(circle, #000 18%, transparent 62%);
	animation: azf-spin 14s linear infinite;
}
.azf-sparks { position: absolute; left: 60px; top: 50%; width: 0; height: 0; }
.azf-sparks i { position: absolute; width: 4px; height: 10px; border-radius: 2px; background: var(--gold-soft); box-shadow: 0 0 8px var(--gold); animation: azf-spark 1.3s cubic-bezier(.16,.84,.2,1) both; animation-delay: calc(var(--t) + 300ms); }
.azf-pop { animation: azf-pop 800ms cubic-bezier(.2,1.4,.4,1) both; }
.azf-shout {
	font-size: 44px; font-weight: 900; line-height: 1; letter-spacing: -.04em; text-transform: uppercase;
	background: linear-gradient(100deg, var(--gold) 20%, #fff7df 40%, var(--gold) 60%); background-size: 200% 100%;
	-webkit-background-clip: text; background-clip: text; color: transparent;
	animation: azf-pop 700ms cubic-bezier(.2,1.4,.4,1) 120ms both, azf-shine 2.4s linear 900ms infinite;
	filter: drop-shadow(0 0 16px rgba(246,196,83,.45));
}
.azf-up { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 13px; font-weight: 900; }
.azf-up span { font-size: 10.5px; text-transform: uppercase; letter-spacing: .16em; color: var(--muted); }
.azf-up img { width: 30px; height: 30px; border-radius: 8px; border: 2px solid var(--gold); }

.azf-finale { width: 100%; text-align: center; }
.azf-finale-title { font-size: 40px; font-weight: 900; color: var(--gold); text-transform: uppercase; letter-spacing: -.03em; }

.azf-bar { position: absolute; left: 20px; right: 20px; bottom: 12px; z-index: 2; display: flex; gap: 3px; }
.azf-seg { min-width: 0; text-align: center; }
.azf-seg-track { height: 6px; border-radius: 3px; overflow: hidden; background: rgba(255,255,255,.1); }
.azf-seg-track i { display: block; height: 100%; background: linear-gradient(90deg, #c98b1c, var(--gold), var(--gold-soft)); transform-origin: left; transition: transform 1.2s cubic-bezier(.16,.84,.2,1); }
.azf-seg span { display: block; margin-top: 4px; font-size: 9px; font-weight: 900; color: rgba(245,243,238,.38); }
.azf-seg.is-done span { color: var(--gold); }
.azf-seg.is-current .azf-seg-track { box-shadow: 0 0 0 1px var(--gold), 0 0 12px rgba(246,196,83,.55); animation: azf-blink 2s ease-in-out infinite; }
.azf-seg.is-current span { color: var(--ink); }

@keyframes azf-panel-in { from { opacity: 0; transform: translateY(18px) scale(.97); filter: blur(8px); } to { opacity: 1; transform: none; filter: none; } }
@keyframes azf-scene-in { from { opacity: 0; clip-path: inset(0 100% 0 0); transform: translateX(22px); } 55% { opacity: 1; } to { opacity: 1; clip-path: inset(0 0 0 0); transform: none; } }
@keyframes azf-leave { to { opacity: 0; transform: translateX(-28px); filter: blur(7px); } }
@keyframes azf-rise { from { opacity: 0; transform: translateY(12px); filter: blur(5px); } to { opacity: 1; transform: none; filter: none; } }
@keyframes azf-sweep { from { transform: translateX(-120%) skewX(-18deg); opacity: 0; } 30% { opacity: 1; } to { transform: translateX(330%) skewX(-18deg); opacity: 0; } }
@keyframes azf-watermark-in { from { opacity: 0; transform: translateY(40px) scale(.9); } to { opacity: 1; transform: none; } }
@keyframes azf-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
@keyframes azf-spin { to { transform: rotate(360deg); } }
@keyframes azf-angle { to { --azf-angle: 360deg; } }
@keyframes azf-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(246,196,83,.55); } 50% { box-shadow: 0 0 0 6px rgba(246,196,83,0); } }
@keyframes azf-glow { 0%, 100% { box-shadow: 0 0 14px rgba(246,196,83,.4); } 50% { box-shadow: 0 0 28px rgba(246,196,83,.8); } }
@keyframes azf-blink { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
@keyframes azf-timer { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes azf-ken { from { transform: scale(1.04); } to { transform: scale(1.16) translateX(-16px); } }
@keyframes azf-pop { 0% { opacity: 0; transform: scale(.4); } 60% { opacity: 1; transform: scale(1.1); } 100% { opacity: 1; transform: scale(1); } }
@keyframes azf-spark { from { opacity: 1; transform: rotate(var(--a)) translateY(-40px) scaleY(1); } to { opacity: 0; transform: rotate(var(--a)) translateY(-150px) scaleY(.3); } }
@keyframes azf-shine { from { background-position: 200% 0; } to { background-position: -200% 0; } }
`;

const EXTRA_CSS = `
.azf-root.is-compact { width: 572px; }
.azf-layout-leave { animation: azf-layout-out 420ms cubic-bezier(.6,0,.8,.2) forwards; }
.azf-shake { animation: azf-shake 620ms cubic-bezier(.36,.07,.19,.97) both; }

.azf-live.is-off { background: rgba(125,211,252,.14); border-color: rgba(125,211,252,.45); color: #d7f0ff; }
.azf-live.is-off i { background: #7dd3fc; box-shadow: 0 0 10px #7dd3fc; }
.azf-chip.is-record { background: linear-gradient(135deg, #fb7185, var(--gold)); color: #210508; border-color: transparent; animation: azf-pulse-red 1.6s ease-in-out infinite; }
.azf-chip.is-warn { background: rgba(251,191,36,.14); border-color: rgba(251,191,36,.5); color: #ffe7a8; }
.azf-stat-sub { margin-top: 2px; font-size: 10.5px; font-weight: 800; color: var(--muted); white-space: nowrap; }
.azf-record-line { color: #ffb4c0; font-weight: 900; }

.azf-numbers { width: 100%; }
.azf-num-grid { display: grid; grid-template-columns: 1.1fr 1fr 1fr .8fr; gap: 14px; margin-top: 10px; }
.azf-num-grid .azf-stat-value { font-size: 22px; }
.azf-today {
	display: flex; align-items: center; gap: 14px; margin-top: 14px; padding: 7px 12px; border-radius: 12px;
	background: rgba(255,255,255,.05); border: 1px solid var(--line); font-size: 12.5px; font-weight: 800; color: var(--muted);
}
.azf-today b { color: var(--win); }
.azf-today-label { font-size: 10px; letter-spacing: .16em; text-transform: uppercase; color: var(--gold); font-weight: 900; }
.azf-today-done { display: flex; align-items: center; gap: 5px; margin-left: auto; color: var(--ink); }
.azf-today-done img { width: 20px; height: 20px; border-radius: 5px; border: 1px solid rgba(94,234,212,.6); }

.azf-loss { position: relative; display: flex; align-items: center; gap: 22px; width: 100%; }
.azf-loss-flash { position: absolute; inset: -60px -40px; z-index: -1; background: radial-gradient(60% 90% at 12% 50%, rgba(251,113,133,.35), transparent 70%); animation: azf-flash 1.4s ease-out both; }
.azf-portrait.is-loss .azf-ring { background: conic-gradient(from var(--azf-angle), var(--loss), rgba(251,113,133,.08) 30%, #ffd0d8 50%, rgba(251,113,133,.08) 80%, var(--loss)); box-shadow: 0 0 22px rgba(251,113,133,.35); }
.azf-portrait.is-loss .azf-portrait-badge { background: linear-gradient(135deg, #ffd0d8, var(--loss)); color: #2a0509; box-shadow: 0 4px 14px rgba(0,0,0,.6), 0 0 16px rgba(251,113,133,.55); }
.azf-portrait.is-loss .azf-portrait-img img { filter: grayscale(.35) brightness(.85); }
.azf-kicker.is-loss { color: var(--loss); }
.azf-flip-row { display: flex; align-items: center; gap: 12px; margin-top: 4px; }
.azf-flip-label { font-size: 30px; font-weight: 900; letter-spacing: -.03em; }
.azf-flip { position: relative; display: inline-block; width: 92px; height: 52px; perspective: 400px; }
.azf-flip span {
	position: absolute; inset: 0; display: grid; place-items: center; border-radius: 12px; font-size: 34px; font-weight: 900; letter-spacing: -.04em;
	backface-visibility: hidden; transform-origin: 50% 100%;
}
.azf-flip-old { background: rgba(255,255,255,.08); border: 1px solid var(--line); color: var(--muted); animation: azf-flip-out 600ms cubic-bezier(.6,0,.4,1) 900ms both; }
.azf-flip-new { background: linear-gradient(135deg, var(--gold-soft), var(--gold)); color: #1b1406; box-shadow: 0 0 22px rgba(246,196,83,.45); transform-origin: 50% 0%; animation: azf-flip-in 600ms cubic-bezier(.2,.8,.3,1.2) 1450ms both; }

.azf-letterdone, .azf-milestone, .azf-streak { position: relative; display: flex; align-items: center; gap: 26px; width: 100%; }
.azf-letterdone .azf-sparks, .azf-milestone .azf-sparks { left: 62px; }
.azf-card { flex: 0 0 auto; width: 112px; height: 130px; perspective: 700px; animation: azf-pop 700ms cubic-bezier(.2,1.4,.4,1) both; }
.azf-card-inner { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; animation: azf-card-flip 900ms cubic-bezier(.5,0,.2,1) 1600ms both; }
.azf-card-face {
	position: absolute; inset: 0; display: grid; place-items: center; border-radius: 18px; backface-visibility: hidden;
	font-size: 92px; font-weight: 900; line-height: 1; color: #1b1406;
	background: linear-gradient(140deg, var(--gold-soft), var(--gold) 55%, #c98b1c);
	box-shadow: 0 14px 34px rgba(0,0,0,.6), 0 0 34px rgba(246,196,83,.45), inset 0 2px 0 rgba(255,255,255,.6);
}
.azf-card-face.is-back { transform: rotateY(180deg); background: linear-gradient(140deg, #26283a, #111320); color: var(--gold); border: 2px solid var(--gold); box-sizing: border-box; }

.azf-ring-chart { position: relative; flex: 0 0 auto; width: 128px; height: 128px; animation: azf-pop 700ms cubic-bezier(.2,1.4,.4,1) both; }
.azf-ring-chart svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.azf-ring-track { fill: rgba(0,0,0,.35); stroke: rgba(255,255,255,.1); stroke-width: 10; }
.azf-ring-fill { fill: none; stroke: var(--gold); stroke-width: 10; stroke-linecap: round; filter: drop-shadow(0 0 8px rgba(246,196,83,.7)); animation: azf-ring 1400ms cubic-bezier(.16,.84,.2,1) 300ms both; }
.azf-ring-chart b { position: absolute; inset: 0; display: grid; place-items: center; font-size: 30px; font-weight: 900; color: var(--gold); letter-spacing: -.04em; }

.azf-streak .azf-shout { font-size: 38px; }
.azf-streak-icons { display: flex; gap: 10px; margin-left: auto; }
.azf-streak-icon { position: relative; width: 62px; height: 62px; animation: azf-pop 600ms cubic-bezier(.2,1.4,.4,1) both; animation-delay: calc(var(--d) * 220ms + 500ms); }
.azf-streak-icon img { width: 100%; height: 100%; border-radius: 14px; border: 2px solid var(--gold); box-sizing: border-box; animation: azf-glow 1.8s ease-in-out infinite; }
.azf-streak-icon span { position: absolute; right: -6px; bottom: -6px; padding: 2px 6px; border-radius: 6px; font-size: 11px; font-weight: 900; background: var(--gold); color: #1b1406; }
.azf-sparks.is-win i { background: #d6fff7; box-shadow: 0 0 8px var(--win); }

.azf-compact {
	position: relative; display: grid; grid-template-columns: 70px 1fr auto; align-items: center; gap: 16px;
	width: 540px; padding: 14px 18px 36px; box-sizing: border-box; overflow: hidden; border-radius: 18px;
	background: radial-gradient(120% 160% at 0% 0%, rgba(246,196,83,.14), transparent 55%), linear-gradient(140deg, rgba(17,18,28,.94), rgba(8,9,14,.9));
	border: 1px solid rgba(246,196,83,.26); box-shadow: 0 16px 40px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.07);
	animation: azf-compact-in 650ms cubic-bezier(.16,.84,.2,1) both;
}
.azf-compact::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 2px; background: linear-gradient(90deg, transparent, var(--gold), var(--gold-soft), var(--gold), transparent); }
.azf-compact.is-off { border-color: rgba(125,211,252,.3); }
.azf-compact-icon { position: relative; width: 70px; height: 70px; }
.azf-compact-icon .azf-ring { border-radius: 20px; }
.azf-compact-icon > img { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 17px; object-fit: cover; box-shadow: 0 8px 20px rgba(0,0,0,.6); }
.azf-compact.is-off .azf-compact-icon > img { filter: saturate(.6); }
.azf-compact.is-off .azf-ring { background: conic-gradient(from var(--azf-angle), #7dd3fc, rgba(125,211,252,.08) 30%, #e0f4ff 50%, rgba(125,211,252,.08) 80%, #7dd3fc); }
.azf-compact-letter, .azf-compact-target {
	position: absolute; right: -7px; bottom: -7px; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 9px; overflow: hidden;
	font-size: 15px; font-weight: 900; color: #1b1406; background: linear-gradient(135deg, var(--gold-soft), var(--gold)); box-shadow: 0 3px 10px rgba(0,0,0,.6);
}
.azf-compact-target { border: 2px solid var(--gold); box-sizing: border-box; }
.azf-compact-target img { width: 100%; height: 100%; object-fit: cover; }
.azf-compact-main { min-width: 0; }
.azf-compact-kicker { display: flex; align-items: center; gap: 6px; font-size: 10.5px; font-weight: 900; letter-spacing: .16em; text-transform: uppercase; color: var(--gold); }
.azf-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--loss); box-shadow: 0 0 10px var(--loss); animation: azf-blink 1.4s ease-in-out infinite; }
.azf-dot.is-off { background: #7dd3fc; box-shadow: 0 0 10px #7dd3fc; }
.azf-compact-title { display: flex; align-items: baseline; gap: 8px; margin-top: 2px; font-size: 26px; font-weight: 900; letter-spacing: -.03em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.azf-compact-title em { font-style: normal; font-size: 12px; font-weight: 800; color: var(--muted); letter-spacing: 0; }
.azf-compact-sub { margin-top: 2px; font-size: 12px; font-weight: 800; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.azf-compact-side { text-align: right; }
.azf-compact-pct { margin-top: 3px; font-size: 11px; font-weight: 900; color: var(--muted); }
.azf-compact-bar { left: 18px; right: 18px; bottom: 8px; }

@keyframes azf-layout-out { to { opacity: 0; transform: scale(.94) translateY(8px); filter: blur(6px); } }
@keyframes azf-compact-in { from { opacity: 0; transform: translateY(-10px) scaleY(.6); filter: blur(6px); } to { opacity: 1; transform: none; filter: none; } }
@keyframes azf-shake { 10%, 90% { transform: translateX(-2px); } 20%, 80% { transform: translateX(4px); } 30%, 50%, 70% { transform: translateX(-7px); } 40%, 60% { transform: translateX(7px); } }
@keyframes azf-flash { 0% { opacity: 0; } 15% { opacity: 1; } 100% { opacity: .35; } }
@keyframes azf-flip-out { to { transform: rotateX(90deg); opacity: .2; } }
@keyframes azf-flip-in { from { transform: rotateX(-90deg); opacity: 0; } to { transform: rotateX(0); opacity: 1; } }
@keyframes azf-card-flip { to { transform: rotateY(180deg); } }
@keyframes azf-ring { from { stroke-dashoffset: var(--ring-from); } to { stroke-dashoffset: var(--ring-to); } }
@keyframes azf-pulse-red { 0%, 100% { box-shadow: 0 0 0 0 rgba(251,113,133,.6); } 50% { box-shadow: 0 0 0 6px rgba(251,113,133,0); } }
`;

export const OVERLAY_CSS = BASE_CSS + EXTRA_CSS;

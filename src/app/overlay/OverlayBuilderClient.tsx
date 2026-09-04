"use client";

import { useEffect, useMemo, useState } from "react";
import { ThemedSelect } from "@/components/ThemedSelect";
import {
	COMMUNITY_OVERLAY_REGIONS,
	COMMUNITY_OVERLAY_GOALS,
	COMMUNITY_OVERLAY_STYLES,
	DEFAULT_FREEFORM_LAYOUT,
	FREEFORM_CANVAS,
	FREEFORM_ELEMENT_TYPES,
	communityOverlayParams,
	normalizeTwitchLogin,
	parseCommunityOverlayConfig,
	type CommunityOverlayConfig,
	type FreeformElementType,
	type FreeformOverlayElement,
} from "@/lib/community-overlay-config";

type TwitchLookupUser = { login: string; displayName: string; profileImageUrl: string; description: string };

type TwitchLookup =
	| { status: "idle"; login: string }
	| { status: "loading"; login: string }
	| { status: "missing"; login: string; message: string }
	| { status: "error"; login: string; message: string }
	| { status: "found"; login: string; live: boolean; user: TwitchLookupUser };

type PreviewRank = { tier: string; leaguePoints: number; score: number; label: string };
type OverlayPreset = { id: string; name: string; query: string; updatedAt: string };

const APEX_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);
const RANK_TIER_LABELS: Record<string, string> = {
	IRON: "Eisen",
	BRONZE: "Bronze",
	SILVER: "Silber",
	GOLD: "Gold",
	PLATINUM: "Platin",
	EMERALD: "Smaragd",
	DIAMOND: "Diamant",
	MASTER: "Master",
	GRANDMASTER: "Grandmaster",
	CHALLENGER: "Challenger",
};

const STYLE_LABELS: Record<(typeof COMMUNITY_OVERLAY_STYLES)[number], string> = {
	default: "Standard",
	compact: "Kompakt",
	session: "Session",
	banner: "Banner",
	rail: "Rank Rail",
	portrait: "Rank-Porträt",
	floating: "Freies HUD",
	freeform: "Free-Format-Builder",
};

const DIMENSIONS: Record<(typeof COMMUNITY_OVERLAY_STYLES)[number], string> = {
	default: "800 × 520",
	compact: "540 × 240",
	session: "860 × 420",
	banner: "1220 × 220",
	rail: "360 × 760",
	portrait: "340 × 400",
	floating: "640 × 420",
	freeform: "1280 × 720",
};

const FREEFORM_ELEMENT_META: Record<FreeformElementType, { label: string; description: string }> = {
	identity: { label: "Spieler", description: "Riot-ID und Live-Zeit" },
	rank: { label: "Rang", description: "Tier, Division und LP" },
	session: { label: "Session", description: "Bilanz, Winrate und LP" },
	goal: { label: "Rangziel", description: "Dynamische Fortschrittsleiste" },
	history: { label: "Matchhistorie", description: "Bis zu 15 letzte Spiele" },
	liveGame: { label: "Live-Spiel", description: "Teilnehmer des aktuellen Games" },
};

export function OverlayBuilderClient({
	initialConfig,
	baseUrl,
	apexUrl,
	accountUrl,
}: {
	initialConfig: CommunityOverlayConfig;
	baseUrl: string;
	apexUrl: string;
	accountUrl: string;
}) {
	const [config, setConfig] = useState(initialConfig);
	const [copied, setCopied] = useState(false);
	const [existingUrl, setExistingUrl] = useState("");
	const [importMessage, setImportMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
	const [previewRiotId, setPreviewRiotId] = useState(initialConfig.ingame);
	const [twitchInput, setTwitchInput] = useState(initialConfig.streamer);
	const [twitchLookup, setTwitchLookup] = useState<TwitchLookup>({ status: "idle", login: "" });
	const [selectedFreeformElement, setSelectedFreeformElement] = useState<FreeformElementType | null>(initialConfig.freeformLayout[0]?.type ?? null);
	const [previewRank, setPreviewRank] = useState<PreviewRank | null>(null);
	const [automaticGoalStart, setAutomaticGoalStart] = useState<{ score: number; label: string; lp: number | null } | null>(null);
	const [presets, setPresets] = useState<OverlayPreset[]>([]);
	const [presetName, setPresetName] = useState("");
	const [presetBusy, setPresetBusy] = useState(false);
	const [presetSignedIn, setPresetSignedIn] = useState<boolean | null>(null);
	const [presetMessage, setPresetMessage] = useState("");
	const [freeformUndo, setFreeformUndo] = useState<FreeformOverlayElement[][]>([]);
	const [freeformRedo, setFreeformRedo] = useState<FreeformOverlayElement[][]>([]);
	const [freeformGrid, setFreeformGrid] = useState(true);
	const [freeformSnap, setFreeformSnap] = useState(true);
	const [freeformSafeArea, setFreeformSafeArea] = useState(true);
	const deferredConfig = useDebouncedValue(config, 650);
	const deferredPreviewRiotId = useDebouncedValue(previewRiotId, 650);
	const deferredTwitchInput = useDebouncedValue(twitchInput, 450);

	const overlayUrl = useMemo(() => `${baseUrl}/obs/community?${communityOverlayParams(config).toString()}`, [baseUrl, config]);
	const previewUrl = useMemo(() => {
		// Keep the preview on the explicitly entered Name#Tag while resolving the
		// canonical Riot ID and stable account id in the background. Automatically
		// captured goal baselines describe the already rendered rank and therefore
		// must not force a second iframe load.
		const usesRiotId = deferredPreviewRiotId.includes("#");
		const usesAutomaticGoalStart =
			automaticGoalStart &&
			deferredConfig.goalStartScore === automaticGoalStart.score &&
			deferredConfig.goalStartLabel === automaticGoalStart.label &&
			deferredConfig.goalStartLp === automaticGoalStart.lp;
		const previewConfig = {
			...deferredConfig,
			ingame: usesRiotId ? deferredPreviewRiotId : deferredConfig.ingame,
			accountId: usesRiotId ? "" : deferredConfig.accountId,
			...(usesAutomaticGoalStart ? { goalStartScore: null, goalStartLabel: "", goalStartLp: null } : {}),
		};
		const params = communityOverlayParams(previewConfig, true);
		if (previewConfig.style === "freeform") {
			params.set("editorgrid", freeformGrid ? "1" : "0");
			params.set("editorsnap", freeformSnap ? "1" : "0");
			params.set("editorsafe", freeformSafeArea ? "1" : "0");
		}
		return `${baseUrl}/obs/community?${params.toString()}`;
	}, [automaticGoalStart, baseUrl, deferredConfig, deferredPreviewRiotId, freeformGrid, freeformSafeArea, freeformSnap]);
	const validRiotId = config.ingame.includes("#") && config.ingame.split("#").every((part) => part.trim().length > 0);
	const stableAccountReady = Boolean(config.accountId);
	const canCopyOverlay = validRiotId && stableAccountReady;
	const canPreviewOverlay = validRiotId || stableAccountReady;
	const supportsLiveGame = config.style !== "banner" && config.style !== "rail" && config.style !== "portrait";
	const activeFreeformElement = config.freeformLayout.find((element) => element.type === selectedFreeformElement) ?? null;
	const hasFreeformHistory = config.freeformLayout.some((element) => element.type === "history");
	const hasFreeformGoal = config.freeformLayout.some((element) => element.type === "goal");
	const hasFreeformLiveGame = config.freeformLayout.some((element) => element.type === "liveGame");
	const effectiveRankTier = previewRank?.tier.toUpperCase() ?? rankTierFromLabel(config.goalStartLabel);
	const usesApexStartLp = effectiveRankTier ? APEX_TIERS.has(effectiveRankTier) : false;
	const goalStartDescription = effectiveRankTier
		? usesApexStartLp
			? `Start · ${config.goalStartLp ?? previewRank?.leaguePoints ?? 0} LP`
			: `${RANK_TIER_LABELS[effectiveRankTier] ?? effectiveRankTier} IV · 0 LP`
		: "";

	useEffect(() => {
		let cancelled = false;
		void fetch("/api/overlay/presets", { cache: "no-store" })
			.then(async (response) => {
				if (!response.ok) throw new Error("Presets konnten nicht geladen werden.");
				return response.json() as Promise<{ presets: OverlayPreset[]; signedIn: boolean }>;
			})
			.then((result) => {
				if (cancelled) return;
				setPresets(result.presets);
				setPresetSignedIn(result.signedIn);
			})
			.catch(() => {
				if (!cancelled) setPresetSignedIn(false);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		const expectedOrigin = new URL(baseUrl).origin;
		function receivePreviewMessage(event: MessageEvent) {
			if (event.origin !== expectedOrigin) return;
			if (event.data?.type === "community-overlay-rank") {
				const accountId = typeof event.data.accountId === "string" && /^[a-z\d_-]{12,64}$/i.test(event.data.accountId) ? event.data.accountId : "";
				const riotId = typeof event.data.riotId === "string" && event.data.riotId.includes("#") ? event.data.riotId.slice(0, 64) : "";
				if (accountId && riotId) {
					setConfig((current) => (current.accountId === accountId && current.ingame === riotId ? current : { ...current, accountId, ingame: riotId }));
				}
				const score = Number(event.data.score);
				const label = typeof event.data.label === "string" ? event.data.label.slice(0, 32) : "";
				const tier = typeof event.data.tier === "string" ? event.data.tier.toUpperCase().slice(0, 20) : "";
				const leaguePoints = Number(event.data.leaguePoints);
				if (!Number.isFinite(score) || score < 0 || !label || !tier || !Number.isFinite(leaguePoints) || leaguePoints < 0) return;
				const nextGoalStartLp = APEX_TIERS.has(tier) ? Math.round(leaguePoints) : null;
				setPreviewRank({ score, label, tier, leaguePoints: Math.round(leaguePoints) });
				setAutomaticGoalStart({ score, label, lp: nextGoalStartLp });
				setConfig((current) => ({
					...current,
					goalStartScore: current.goalStartScore ?? score,
					goalStartLabel: current.goalStartLabel || label,
					goalStartLp: current.goalStartLp ?? nextGoalStartLp,
				}));
				return;
			}
			if (event.data?.type === "community-overlay-element-selected" && FREEFORM_ELEMENT_TYPES.includes(event.data.elementType as FreeformElementType)) {
				setSelectedFreeformElement(event.data.elementType as FreeformElementType);
				return;
			}
			if (event.data?.type === "community-overlay-layout" && Array.isArray(event.data.layout)) {
				const layout = event.data.layout as FreeformOverlayElement[];
				if (layout.every((element) => FREEFORM_ELEMENT_TYPES.includes(element.type))) {
					setConfig((current) => {
						setFreeformUndo((history) => [...history, current.freeformLayout.map((element) => ({ ...element }))].slice(-40));
						setFreeformRedo([]);
						return { ...current, freeformLayout: layout.map((element) => ({ ...element })) };
					});
				}
			}
		}
		window.addEventListener("message", receivePreviewMessage);
		return () => window.removeEventListener("message", receivePreviewMessage);
	}, [baseUrl]);

	useEffect(() => {
		const login = normalizeTwitchLogin(deferredTwitchInput);
		if (!login) return;

		const controller = new AbortController();
		const timer = window.setTimeout(async () => {
			try {
				const response = await fetch(`/api/twitch/status?login=${encodeURIComponent(login)}&scope=overlay`, { signal: controller.signal });
				if (!response.ok) throw new Error("Twitch-Suche ist gerade nicht verfügbar.");
				const result = (await response.json()) as { live: boolean; user: TwitchLookupUser | null };
				if (!result.user) {
					setTwitchLookup({ status: "missing", login, message: `Kein Twitch-Kanal für @${login} gefunden.` });
					return;
				}
				setTwitchLookup({ status: "found", login, live: result.live, user: result.user });
			} catch (error) {
				if (controller.signal.aborted) return;
				setTwitchLookup({ status: "error", login, message: error instanceof Error ? error.message : "Twitch-Kanal konnte nicht gesucht werden." });
			}
		}, 450);

		return () => {
			controller.abort();
			window.clearTimeout(timer);
		};
	}, [deferredTwitchInput]);

	function update<K extends keyof CommunityOverlayConfig>(key: K, value: CommunityOverlayConfig[K]) {
		setConfig((current) => ({ ...current, [key]: value }));
	}

	function applyOverlayConfig(next: CommunityOverlayConfig) {
		setConfig(next);
		setFreeformUndo([]);
		setFreeformRedo([]);
		setPreviewRiotId(next.ingame);
		setPreviewRank(null);
		setAutomaticGoalStart(null);
		setSelectedFreeformElement(next.freeformLayout[0]?.type ?? null);
		setTwitchInput(next.streamer);
		setTwitchLookup(next.streamer ? { status: "loading", login: next.streamer } : { status: "idle", login: "" });
		setCopied(false);
	}

	async function savePreset() {
		if (!canCopyOverlay || !presetName.trim() || presetBusy) return;
		setPresetBusy(true);
		setPresetMessage("");
		try {
			const response = await fetch("/api/overlay/presets", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: presetName.trim(), query: communityOverlayParams(config).toString() }),
			});
			const result = (await response.json()) as { preset?: OverlayPreset; message?: string };
			if (!response.ok || !result.preset) throw new Error(result.message || "Preset konnte nicht gespeichert werden.");
			setPresets((current) => [result.preset!, ...current.filter((preset) => preset.id !== result.preset!.id)].slice(0, 12));
			setPresetName("");
			setPresetMessage("Preset gespeichert.");
			setPresetSignedIn(true);
		} catch (error) {
			setPresetMessage(error instanceof Error ? error.message : "Preset konnte nicht gespeichert werden.");
		} finally {
			setPresetBusy(false);
		}
	}

	function loadPreset(preset: OverlayPreset) {
		applyOverlayConfig(parseCommunityOverlayConfig(new URLSearchParams(preset.query)));
		setPresetMessage(`„${preset.name}“ geladen.`);
	}

	async function deletePreset(preset: OverlayPreset) {
		if (presetBusy) return;
		setPresetBusy(true);
		setPresetMessage("");
		try {
			const response = await fetch(`/api/overlay/presets?id=${encodeURIComponent(preset.id)}`, { method: "DELETE" });
			if (!response.ok) throw new Error("Preset konnte nicht gelöscht werden.");
			setPresets((current) => current.filter((entry) => entry.id !== preset.id));
			setPresetMessage("Preset gelöscht.");
		} catch (error) {
			setPresetMessage(error instanceof Error ? error.message : "Preset konnte nicht gelöscht werden.");
		} finally {
			setPresetBusy(false);
		}
	}

	function updateFreeformElement(type: FreeformElementType, change: Partial<FreeformOverlayElement>) {
		setConfig((current) => {
			setFreeformUndo((history) => [...history, current.freeformLayout.map((element) => ({ ...element }))].slice(-40));
			setFreeformRedo([]);
			return {
				...current,
				freeformLayout: current.freeformLayout.map((element) => (element.type === type ? { ...element, ...change } : element)),
			};
		});
	}

	function addFreeformElement(type: FreeformElementType) {
		setConfig((current) => {
			if (current.freeformLayout.some((element) => element.type === type)) return current;
			setFreeformUndo((history) => [...history, current.freeformLayout.map((element) => ({ ...element }))].slice(-40));
			setFreeformRedo([]);
			const template = DEFAULT_FREEFORM_LAYOUT.find((element) => element.type === type)!;
			const maxZ = Math.max(0, ...current.freeformLayout.map((element) => element.zIndex));
			return {
				...current,
				showGoal: type === "goal" ? true : current.showGoal,
				showLiveGame: type === "liveGame" ? true : current.showLiveGame,
				freeformLayout: [...current.freeformLayout, { ...template, zIndex: Math.min(20, maxZ + 1) }],
			};
		});
		setSelectedFreeformElement(type);
	}

	function removeFreeformElement(type: FreeformElementType) {
		setConfig((current) => {
			setFreeformUndo((history) => [...history, current.freeformLayout.map((element) => ({ ...element }))].slice(-40));
			setFreeformRedo([]);
			return { ...current, freeformLayout: current.freeformLayout.filter((element) => element.type !== type) };
		});
		setSelectedFreeformElement((current) => (current === type ? null : current));
	}

	function resetFreeformLayout() {
		setConfig((current) => {
			setFreeformUndo((history) => [...history, current.freeformLayout.map((element) => ({ ...element }))].slice(-40));
			setFreeformRedo([]);
			return { ...current, freeformLayout: DEFAULT_FREEFORM_LAYOUT.map((element) => ({ ...element })) };
		});
		setSelectedFreeformElement(DEFAULT_FREEFORM_LAYOUT[0].type);
	}

	function undoFreeformLayout() {
		const previous = freeformUndo.at(-1);
		if (!previous) return;
		setFreeformRedo((history) => [...history, config.freeformLayout.map((element) => ({ ...element }))].slice(-40));
		setFreeformUndo((history) => history.slice(0, -1));
		setConfig((current) => ({ ...current, freeformLayout: previous.map((element) => ({ ...element })) }));
	}

	function redoFreeformLayout() {
		const next = freeformRedo.at(-1);
		if (!next) return;
		setFreeformUndo((history) => [...history, config.freeformLayout.map((element) => ({ ...element }))].slice(-40));
		setFreeformRedo((history) => history.slice(0, -1));
		setConfig((current) => ({ ...current, freeformLayout: next.map((element) => ({ ...element })) }));
	}

	function moveFreeformLayer(type: FreeformElementType, direction: "front" | "back") {
		const zValues = config.freeformLayout.map((element) => element.zIndex);
		updateFreeformElement(type, { zIndex: direction === "front" ? Math.min(20, Math.max(...zValues) + 1) : Math.max(1, Math.min(...zValues) - 1) });
	}

	function keepFreeformElementSafe(type: FreeformElementType) {
		const element = config.freeformLayout.find((entry) => entry.type === type);
		if (!element) return;
		const margin = 32;
		updateFreeformElement(type, {
			x: Math.max(margin, Math.min(element.x, FREEFORM_CANVAS.width - element.width - margin)),
			y: Math.max(margin, Math.min(element.y, FREEFORM_CANVAS.height - element.height - margin)),
		});
	}

	async function copyUrl() {
		if (!canCopyOverlay) return;
		await navigator.clipboard.writeText(overlayUrl);
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1800);
	}

	function importOverlayUrl() {
		const value = existingUrl.trim();
		if (!value) {
			setImportMessage({ tone: "error", text: "Bitte füge zuerst deine bestehende Overlay-URL ein." });
			return;
		}

		try {
			const normalized = /^[a-z][a-z\d+.-]*:\/\//i.test(value) || value.startsWith("/") ? value : `https://${value}`;
			const url = new URL(normalized, baseUrl);
			if (url.pathname !== "/obs/community" && url.pathname !== "/overlay") {
				throw new Error("Diese URL gehört nicht zum Community-Overlay-Builder.");
			}
			const imported = parseCommunityOverlayConfig(url.searchParams);
			if (!imported.accountId && !imported.ingame.includes("#")) throw new Error("In dieser URL ist kein Riot-Account gespeichert.");

			applyOverlayConfig(imported);
			setImportMessage({ tone: "success", text: "Overlay geladen. Du kannst alle Einstellungen jetzt weiterbearbeiten." });
		} catch (error) {
			setImportMessage({ tone: "error", text: error instanceof Error ? error.message : "Die Overlay-URL konnte nicht gelesen werden." });
		}
	}

	return (
		<div className="min-h-screen overflow-x-hidden bg-[#03100a] text-emerald-50">
			<div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_4%,rgba(190,242,100,0.13),transparent_30%),radial-gradient(circle_at_88%_20%,rgba(34,211,238,0.11),transparent_30%),linear-gradient(145deg,#03100a_0%,#061b12_48%,#020906_100%)]" />
			<main className="relative mx-auto w-full max-w-[112rem] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
				<header className="grid gap-5 rounded-[1.8rem] border border-lime-100/12 bg-black/20 px-5 py-5 shadow-2xl shadow-black/30 backdrop-blur-xl lg:grid-cols-[1fr_auto] lg:items-center lg:px-7">
					<div className="max-w-4xl">
						<div className="text-[10px] font-black uppercase tracking-[0.34em] text-lime-200/65">Lauchgruen · Stream Tools</div>
						<h1 className="mt-2 text-3xl font-black tracking-[-0.045em] sm:text-4xl">Dein League-Overlay. Deine Farben.</h1>
						<p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-100/58">Erstelle kostenlos eine OBS-Browserquelle aus Riot-ID und optionalem Twitch-Kanal.</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<a
							href={accountUrl}
							className="rounded-2xl bg-[#9146ff] px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-[#9146ff]/20 transition hover:-translate-y-0.5 hover:bg-[#a970ff]"
						>
							Streamer-Profil
						</a>
						<a
							href={apexUrl}
							className="rounded-2xl border border-white/12 bg-white/[0.04] px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-100 transition hover:border-lime-200/35 hover:text-lime-100"
						>
							Zurück zu lauchgruen.de
						</a>
					</div>
				</header>

				<div className="mt-5 grid items-start gap-5 xl:grid-cols-[25rem_minmax(0,1fr)]">
					<aside className="themed-scrollbar grid content-start gap-3 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pr-2">
						<div className="rounded-[1.5rem] border border-cyan-100/12 bg-gradient-to-r from-cyan-300/[0.08] to-lime-300/[0.06] px-4 py-3">
							<div className="flex items-center justify-between gap-3">
								<div>
									<div className="text-[8px] font-black uppercase tracking-[0.24em] text-cyan-100/45">Control Deck</div>
									<div className="mt-1 text-sm font-black">Einstellungen live bearbeiten</div>
								</div>
								<span className={`size-2 rounded-full ${validRiotId ? "bg-lime-300 shadow-[0_0_12px_rgba(190,242,100,0.75)]" : "bg-amber-300/60"}`} />
							</div>
						</div>
						<Panel kicker="Account" title="Spieler und Stream" defaultOpen>
							<Field label="Riot-ID" hint="Pflichtfeld · Name#Tag">
								<input
									value={config.ingame}
									onChange={(event) => {
										setPreviewRank(null);
										setAutomaticGoalStart(null);
										setPreviewRiotId(event.target.value);
										setConfig((current) => ({
											...current,
											ingame: event.target.value,
											accountId: "",
											goalStartScore: null,
											goalStartLabel: "",
											goalStartLp: null,
										}));
									}}
									placeholder="Spielername#TAG"
									className={inputClass}
								/>
							</Field>
							<Field label="Region" hint="Eine automatische weltweite Namenssuche wäre nicht eindeutig.">
								<ThemedSelect
									value={config.region}
									onChange={(value) => {
										setPreviewRank(null);
										setAutomaticGoalStart(null);
										setConfig((current) => ({ ...current, region: value, goalStartScore: null, goalStartLabel: "", goalStartLp: null }));
									}}
									options={COMMUNITY_OVERLAY_REGIONS.map((region) => ({ value: region.value, label: region.label }))}
									ariaLabel="Riot-Region"
								/>
							</Field>
							<Field label="Twitch-Kanal" hint="Optional · Nutzername oder Profil-URL">
								<input
									value={twitchInput}
									onChange={(event) => {
										const value = event.target.value;
										const login = normalizeTwitchLogin(value);
										setTwitchInput(value);
										setTwitchLookup(login ? { status: "loading", login } : { status: "idle", login: "" });
										if (login !== config.streamer) {
											setConfig((current) => ({ ...current, streamer: "", hideOutsideLeague: false }));
										}
									}}
									placeholder="kanalname oder twitch.tv/kanalname"
									className={inputClass}
								/>
							</Field>
							<TwitchSearchResult
								lookup={twitchLookup}
								selectedLogin={config.streamer}
								onSelect={(user) => {
									update("streamer", user.login);
									setTwitchInput(user.login);
								}}
							/>
							<Toggle
								label="Nur bei League of Legends anzeigen"
								checked={config.hideOutsideLeague}
								onChange={(value) => update("hideOutsideLeague", value)}
								disabled={!config.streamer}
							/>
							<p className="text-[10px] leading-5 text-emerald-100/38">
								{config.streamer
									? "Blendet die OBS-Quelle aus, wenn der Kanal live ist, aber eine andere Twitch-Kategorie nutzt."
									: "Wähle zuerst einen gefundenen Twitch-Kanal aus, um die Kategorie-Erkennung zu aktivieren."}
							</p>
							<div className="rounded-2xl border border-[#9146ff]/20 bg-gradient-to-br from-[#9146ff]/[0.12] to-black/10 p-4">
								<div className="text-[9px] font-black uppercase tracking-[0.22em] text-[#d8c2ff]/65">Streamer-Erkennung</div>
								<div className="mt-1 text-sm font-black text-white">Im Live-Spiel violett erscheinen</div>
								<p className="mt-2 text-[11px] leading-5 text-emerald-100/52">
									Verbinde Twitch und verifiziere deine Riot-ID einmalig. Danach kannst du freiwillig erlauben, dass Community-Overlays deinen Twitch-Namen bei
									Live-Game-Teilnehmern anzeigen.
								</p>
								<a
									href={accountUrl}
									className="mt-3 inline-flex rounded-xl border border-[#c9a8ff]/25 bg-[#9146ff]/20 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#eadfff] transition hover:bg-[#9146ff]/30"
								>
									Verknüpfung verwalten
								</a>
							</div>
						</Panel>

						<Panel kicker="Darstellung" title="Format und Inhalt" defaultOpen>
							<Field label="Stil">
								<ThemedSelect
									value={config.style}
									onChange={(value) => {
										const style = value as CommunityOverlayConfig["style"];
										setConfig((current) => ({
											...current,
											style,
											...(style === "freeform" || style === "portrait" ? { rotateLastGame: false } : {}),
											...(style === "banner" || style === "rail" || style === "portrait" ? { showLiveGame: false } : {}),
											...(style === "portrait" && current.streamer ? { hideOutsideLeague: true } : {}),
										}));
										if (style === "freeform" && !selectedFreeformElement) setSelectedFreeformElement(config.freeformLayout[0]?.type ?? null);
									}}
									options={COMMUNITY_OVERLAY_STYLES.map((style) => ({
										value: style,
										label: STYLE_LABELS[style],
										description: `Empfohlen: ${DIMENSIONS[style]}`,
									}))}
									ariaLabel="Overlay-Stil"
								/>
							</Field>
							{config.style === "freeform" ? (
								<div className="grid gap-2">
									<div className="rounded-xl border border-cyan-100/12 bg-cyan-200/[0.05] px-3 py-2.5 text-[11px] leading-5 text-cyan-50/58">
										In der Vorschau kannst du Bausteine direkt verschieben und am Griff unten rechts skalieren.
									</div>
									<Toggle
										label="Nur aktuelle Stream-Session"
										checked={config.sessionOnly}
										onChange={(value) => update("sessionOnly", value)}
										disabled={!hasFreeformHistory}
									/>
									<Toggle
										label="Berechnete MVP-/ACE-Badges"
										checked={config.showBadges}
										onChange={(value) => update("showBadges", value)}
										disabled={!hasFreeformHistory}
									/>
									<Toggle
										label="Streamer im Live-Spiel anzeigen"
										checked={config.showStreamerParticipants}
										onChange={(value) => update("showStreamerParticipants", value)}
										disabled={!hasFreeformLiveGame}
									/>
								</div>
							) : config.style === "portrait" ? (
								<div className="rounded-xl border border-cyan-100/12 bg-cyan-200/[0.05] px-3 py-3 text-[11px] leading-5 text-cyan-50/58">
									Profilicon, animierter Rahmen in der aktuellen Rangfarbe und eine wechselnde Zeile für Rang, Session-W/L und Gesamt-W/L. Farben und Inhalt
									werden automatisch aus den Riot-Daten erzeugt.
								</div>
							) : (
								<div className="grid gap-2">
									<Toggle label="Rang" checked={config.showRank} onChange={(value) => update("showRank", value)} />
									<Toggle label="Queue- und Spieltyp" checked={config.showQueue} onChange={(value) => update("showQueue", value)} />
									<Toggle label="Session-Winrate" checked={config.showWinRate} onChange={(value) => update("showWinRate", value)} />
									<Toggle label="Fortschritt zum Rangziel" checked={config.showGoal} onChange={(value) => update("showGoal", value)} />
									<Toggle label="Matchhistorie" checked={config.showHistory} onChange={(value) => update("showHistory", value)} />
									<Toggle
										label="Nur aktuelle Stream-Session"
										checked={config.sessionOnly}
										onChange={(value) => update("sessionOnly", value)}
										disabled={!config.showHistory}
									/>
									<Toggle label="Session-LP anzeigen" checked={config.showLp} onChange={(value) => update("showLp", value)} />
									<Toggle
										label="Berechnete MVP-/ACE-Badges"
										checked={config.showBadges}
										onChange={(value) => update("showBadges", value)}
										disabled={!config.showHistory}
									/>
									{supportsLiveGame ? (
										<Toggle
											label="Live-Game-Teilnehmer"
											checked={config.showLiveGame}
											onChange={(value) =>
												setConfig((current) => ({
													...current,
													showLiveGame: value,
												}))
											}
										/>
									) : null}
									<Toggle
										label="Streamer im aktuellen Spiel anzeigen"
										checked={config.showStreamerParticipants}
										onChange={(value) => update("showStreamerParticipants", value)}
									/>
									{supportsLiveGame && config.showLiveGame ? (
										<div className="col-span-full text-[10px] leading-5 text-emerald-100/42">
											Erscheint nur während eines von Riot erkannten Live-Spiels. Rollen werden anhand von Smite und Champion-Rollen sortiert.
										</div>
									) : null}
									{config.showStreamerParticipants ? (
										<div className="col-span-full rounded-xl border border-[#9146ff]/20 bg-[#9146ff]/[0.08] px-3 py-2.5 text-[10px] leading-5 text-[#d8c2ff]/70">
											{config.showLiveGame
												? "Freigegebene Streamer werden violett direkt im Teilnehmerfeld markiert. "
												: "Ohne Teilnehmerfeld erscheint eine kompakte violette Streamer-Leiste. "}
											Sichtbar werden nur Spieler, die Twitch verbunden, ihre Riot-ID verifiziert und die öffentliche Anzeige im{" "}
											<a href={accountUrl} className="font-black text-white underline decoration-[#c9a8ff]/50 underline-offset-2">
												Streamer-Profil
											</a>{" "}
											freigegeben haben.
										</div>
									) : null}
									<Toggle
										label="Alle 30 Sek. zur letzten Partie wechseln"
										checked={config.rotateLastGame}
										onChange={(value) => update("rotateLastGame", value)}
									/>
									{config.rotateLastGame ? (
										<div className="col-span-full text-[10px] leading-5 text-emerald-100/42">
											Ohne vorhandenes Session-Spiel bleibt die normale Overlay-Ansicht dauerhaft sichtbar.
										</div>
									) : null}
									<Toggle label="Layout horizontal spiegeln" checked={config.flip} onChange={(value) => update("flip", value)} />
								</div>
							)}
							{config.style !== "portrait" && (config.showHistory || (config.style === "freeform" && hasFreeformHistory)) ? (
								<Field label="Zeilen Matchhistorie">
									<ThemedSelect
										value={String(config.historyRows)}
										onChange={(value) => update("historyRows", Number(value) as 1 | 2 | 3)}
										options={[1, 2, 3].map((rows) => ({
											value: String(rows),
											label: `${rows} ${rows === 1 ? "Zeile" : "Zeilen"} · bis zu ${rows * 5} Spiele`,
										}))}
										ariaLabel="Zeilen Matchhistorie"
									/>
								</Field>
							) : null}
							{config.style !== "portrait" && (config.showGoal || (config.style === "freeform" && hasFreeformGoal)) ? (
								<Field label="Rangziel" hint="Bestimmt Beschriftung und Fortschritt der Leiste">
									<ThemedSelect
										value={config.goalTier}
										onChange={(value) => update("goalTier", value as CommunityOverlayConfig["goalTier"])}
										options={COMMUNITY_OVERLAY_GOALS.map((goal) => ({ value: goal.value, label: goal.label }))}
										ariaLabel="Rangziel"
									/>
									{goalStartDescription ? <div className="mt-2 text-[10px] font-bold text-emerald-100/38">Startpunkt: {goalStartDescription}</div> : null}
									{usesApexStartLp ? (
										<label className="mt-3 block rounded-xl border border-cyan-100/12 bg-cyan-200/[0.04] p-3">
											<span className="flex items-center justify-between gap-2 text-[9px] font-black uppercase tracking-[0.16em] text-cyan-50/62">
												<span>Ausgangs-LP</span>
												<span className="normal-case tracking-normal text-cyan-50/35">Master+</span>
											</span>
											<input
												type="number"
												min="0"
												max="10000"
												value={config.goalStartLp ?? previewRank?.leaguePoints ?? 0}
												onChange={(event) => update("goalStartLp", Math.max(0, Math.min(10_000, Number(event.target.value) || 0)))}
												className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-[#07110c] px-3 font-mono text-sm font-black text-emerald-50 outline-none [appearance:textfield] focus:border-cyan-200/40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
											/>
											<span className="mt-2 block text-[10px] leading-5 text-cyan-50/42">Der LP-Stand am Beginn deiner gewünschten Fortschrittsmessung.</span>
										</label>
									) : null}
								</Field>
							) : null}
							{config.style !== "portrait" ? (
								<div className="rounded-xl border border-amber-200/14 bg-amber-200/[0.05] px-3 py-2.5 text-[11px] leading-5 text-amber-50/55">
									LP pro einzelner Partie und ein offizieller MVP-/ACE-Status werden von Riot nicht bereitgestellt. Das Overlay zeigt ein LP-Delta, sobald das
									Tracking rechtzeitig vor dem ersten Session-Spiel aktiv war; Badges sind eine berechnete Performance-Auszeichnung.
								</div>
							) : null}
						</Panel>

						{config.style === "freeform" ? (
							<Panel kicker="Free Format" title="Bausteine und Position" defaultOpen>
								<div className="grid grid-cols-2 gap-2">
									<button
										type="button"
										onClick={undoFreeformLayout}
										disabled={!freeformUndo.length}
										className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-[8px] font-black uppercase tracking-[0.14em] text-emerald-100/65 disabled:opacity-25"
									>
										Rückgängig
									</button>
									<button
										type="button"
										onClick={redoFreeformLayout}
										disabled={!freeformRedo.length}
										className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-[8px] font-black uppercase tracking-[0.14em] text-emerald-100/65 disabled:opacity-25"
									>
										Wiederholen
									</button>
								</div>
								<div className="grid gap-2 rounded-xl border border-white/8 bg-black/15 p-2">
									<Toggle label="20-Pixel-Raster" checked={freeformGrid} onChange={setFreeformGrid} />
									<Toggle label="Am Raster einrasten" checked={freeformSnap} onChange={setFreeformSnap} />
									<Toggle label="Safe Area anzeigen" checked={freeformSafeArea} onChange={setFreeformSafeArea} />
								</div>
								<div className="grid grid-cols-2 gap-2">
									{FREEFORM_ELEMENT_TYPES.map((type) => {
										const active = config.freeformLayout.some((element) => element.type === type);
										const selected = selectedFreeformElement === type;
										return (
											<button
												key={type}
												type="button"
												onClick={() => (active ? setSelectedFreeformElement(type) : addFreeformElement(type))}
												className={`rounded-xl border px-3 py-3 text-left transition ${selected ? "border-cyan-200/55 bg-cyan-200/[0.12]" : active ? "border-lime-200/18 bg-lime-200/[0.06] hover:border-lime-200/35" : "border-dashed border-white/12 bg-black/15 opacity-60 hover:opacity-100"}`}
											>
												<span className="block text-[10px] font-black text-emerald-50">{FREEFORM_ELEMENT_META[type].label}</span>
												<span className="mt-1 block text-[8px] leading-4 text-emerald-100/42">
													{active ? FREEFORM_ELEMENT_META[type].description : "+ Hinzufügen"}
												</span>
											</button>
										);
									})}
								</div>

								{activeFreeformElement ? (
									<div className="rounded-2xl border border-cyan-100/12 bg-black/18 p-3">
										<div className="flex items-center justify-between gap-3">
											<div>
												<div className="text-[8px] font-black uppercase tracking-[0.18em] text-cyan-100/42">Ausgewählt</div>
												<div className="mt-1 text-sm font-black">{FREEFORM_ELEMENT_META[activeFreeformElement.type].label}</div>
											</div>
											<button
												type="button"
												onClick={() => removeFreeformElement(activeFreeformElement.type)}
												className="rounded-lg border border-rose-200/18 bg-rose-300/[0.07] px-2.5 py-2 text-[8px] font-black uppercase tracking-[0.14em] text-rose-100/75 transition hover:border-rose-200/35 hover:bg-rose-300/[0.12]"
											>
												Entfernen
											</button>
										</div>

										<div className="mt-4 grid grid-cols-2 gap-2">
											<NumberField
												label="X"
												value={activeFreeformElement.x}
												min={0}
												max={FREEFORM_CANVAS.width - activeFreeformElement.width}
												onChange={(value) => updateFreeformElement(activeFreeformElement.type, { x: value })}
											/>
											<NumberField
												label="Y"
												value={activeFreeformElement.y}
												min={0}
												max={FREEFORM_CANVAS.height - activeFreeformElement.height}
												onChange={(value) => updateFreeformElement(activeFreeformElement.type, { y: value })}
											/>
											<NumberField
												label="Breite"
												value={activeFreeformElement.width}
												min={150}
												max={FREEFORM_CANVAS.width - activeFreeformElement.x}
												onChange={(value) => updateFreeformElement(activeFreeformElement.type, { width: value })}
											/>
											<NumberField
												label="Höhe"
												value={activeFreeformElement.height}
												min={72}
												max={FREEFORM_CANVAS.height - activeFreeformElement.y}
												onChange={(value) => updateFreeformElement(activeFreeformElement.type, { height: value })}
											/>
											<NumberField
												label="Ebene"
												value={activeFreeformElement.zIndex}
												min={1}
												max={20}
												onChange={(value) => updateFreeformElement(activeFreeformElement.type, { zIndex: value })}
											/>
										</div>
										<div className="mt-3 grid grid-cols-3 gap-2">
											<button
												type="button"
												onClick={() => moveFreeformLayer(activeFreeformElement.type, "back")}
												className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2 text-[8px] font-black uppercase tracking-[0.12em] text-emerald-100/58"
											>
												Nach hinten
											</button>
											<button
												type="button"
												onClick={() => keepFreeformElementSafe(activeFreeformElement.type)}
												className="rounded-xl border border-amber-200/14 bg-amber-200/[0.05] px-2 py-2 text-[8px] font-black uppercase tracking-[0.12em] text-amber-100/65"
											>
												Safe Area
											</button>
											<button
												type="button"
												onClick={() => moveFreeformLayer(activeFreeformElement.type, "front")}
												className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2 text-[8px] font-black uppercase tracking-[0.12em] text-emerald-100/58"
											>
												Nach vorne
											</button>
										</div>

										<div className="mt-4 grid grid-cols-2 gap-2">
											<ColorField
												label="Text"
												value={activeFreeformElement.textColor || config.text}
												onChange={(value) => updateFreeformElement(activeFreeformElement.type, { textColor: value })}
											/>
											<ColorField
												label="Akzent"
												value={activeFreeformElement.accentColor || config.primary}
												onChange={(value) => updateFreeformElement(activeFreeformElement.type, { accentColor: value })}
											/>
											<ColorField
												label="Hintergrund"
												value={activeFreeformElement.backgroundColor || config.background}
												onChange={(value) => updateFreeformElement(activeFreeformElement.type, { backgroundColor: value })}
											/>
											<ColorField
												label="Rand"
												value={activeFreeformElement.borderColor || config.border}
												onChange={(value) => updateFreeformElement(activeFreeformElement.type, { borderColor: value })}
											/>
										</div>
										<div className="mt-3 grid gap-2">
											<Toggle
												label="Hintergrund"
												checked={activeFreeformElement.showBackground}
												onChange={(value) => updateFreeformElement(activeFreeformElement.type, { showBackground: value })}
											/>
											<Toggle
												label="Rahmen"
												checked={activeFreeformElement.showBorder}
												onChange={(value) => updateFreeformElement(activeFreeformElement.type, { showBorder: value })}
											/>
											{activeFreeformElement.showBackground ? (
												<Field label="Deckkraft" hint={`${activeFreeformElement.backgroundOpacity}%`}>
													<input
														type="range"
														min="0"
														max="100"
														value={activeFreeformElement.backgroundOpacity}
														onChange={(event) => updateFreeformElement(activeFreeformElement.type, { backgroundOpacity: Number(event.target.value) })}
														className="w-full accent-cyan-200"
													/>
												</Field>
											) : null}
										</div>
										<button
											type="button"
											onClick={() =>
												updateFreeformElement(activeFreeformElement.type, { textColor: "", accentColor: "", backgroundColor: "", borderColor: "" })
											}
											className="mt-3 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[8px] font-black uppercase tracking-[0.15em] text-emerald-100/58 transition hover:border-white/20 hover:text-emerald-50"
										>
											Globale Farben übernehmen
										</button>
									</div>
								) : (
									<div className="rounded-xl border border-dashed border-white/12 px-3 py-4 text-center text-[10px] leading-5 text-emerald-100/42">
										Wähle einen Baustein aus oder füge einen hinzu.
									</div>
								)}

								<button
									type="button"
									onClick={resetFreeformLayout}
									className="w-full rounded-xl border border-amber-200/16 bg-amber-200/[0.05] px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.16em] text-amber-50/68 transition hover:border-amber-200/30 hover:bg-amber-200/[0.09]"
								>
									Standardlayout wiederherstellen
								</button>
							</Panel>
						) : null}

						<Panel kicker="Theme" title="Farben und Oberfläche">
							{config.style === "portrait" ? (
								<div className="rounded-xl border border-cyan-100/12 bg-cyan-100/[0.04] px-3 py-3 text-[11px] leading-5 text-cyan-50/50">
									Der Porträt-Rahmen ist transparent. Leuchten, Rahmen und Statistikfarbe wechseln automatisch passend zu Iron, Bronze, Silber, Gold, Platin,
									Smaragd, Diamant, Master, Grandmaster oder Challenger.
								</div>
							) : null}
							{config.style !== "portrait" && config.style !== "floating" && config.style !== "freeform" ? (
								<div className="grid gap-2">
									<Toggle label="Hintergrund anzeigen" checked={config.showBackground} onChange={(value) => update("showBackground", value)} />
									<Toggle label="Rahmen anzeigen" checked={config.showBorder} onChange={(value) => update("showBorder", value)} />
								</div>
							) : null}
							{config.style !== "portrait" ? (
								<div className="grid grid-cols-2 gap-3">
									<ColorField label="Primär" value={config.primary} onChange={(value) => update("primary", value)} />
									<ColorField label="Sekundär" value={config.secondary} onChange={(value) => update("secondary", value)} />
									<ColorField label="Highlight" value={config.highlight} onChange={(value) => update("highlight", value)} />
									<ColorField label="Text" value={config.text} onChange={(value) => update("text", value)} />
									{config.style !== "floating" && config.showBackground ? (
										<ColorField label="Hintergrund" value={config.background} onChange={(value) => update("background", value)} />
									) : null}
									{config.style !== "floating" && config.showBorder ? (
										<ColorField label="Rand" value={config.border} onChange={(value) => update("border", value)} />
									) : null}
								</div>
							) : null}
							{config.style !== "portrait" && config.style !== "floating" && config.style !== "freeform" && config.showBackground ? (
								<Field label="Hintergrund-Deckkraft" hint={`${config.backgroundOpacity}%`}>
									<input
										type="range"
										min="0"
										max="100"
										value={config.backgroundOpacity}
										onChange={(event) => update("backgroundOpacity", Number(event.target.value))}
										className="w-full accent-lime-300"
									/>
								</Field>
							) : config.style === "floating" ? (
								<div className="rounded-xl border border-cyan-100/12 bg-cyan-100/[0.04] px-3 py-2.5 text-[11px] leading-5 text-cyan-50/50">
									Das freie HUD besitzt bewusst weder Hintergrund noch Rand.
								</div>
							) : config.style === "freeform" ? (
								<div className="rounded-xl border border-cyan-100/12 bg-cyan-100/[0.04] px-3 py-2.5 text-[11px] leading-5 text-cyan-50/50">
									Diese Farben sind die Standardpalette. Ausgewählte Bausteine können sie individuell überschreiben.
								</div>
							) : null}
						</Panel>
					</aside>

					<section className="min-w-0 xl:sticky xl:top-4 xl:self-start">
						<div className="overflow-hidden rounded-[2.2rem] border border-cyan-100/13 bg-[#07140d]/85 shadow-2xl shadow-black/30">
							<div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-3.5 sm:px-6">
								<div>
									<div className="text-[9px] font-black uppercase tracking-[0.28em] text-cyan-100/48">
										{config.style === "freeform" ? "Interaktiver Editor" : "Live Preview"}
									</div>
									<h2 className="mt-1 text-xl font-black">{config.style === "freeform" ? "Ziehen, skalieren, gestalten." : "So erscheint es in OBS."}</h2>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<div className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.15em] text-emerald-100/55">
										OBS-Größe {DIMENSIONS[config.style]}
									</div>
									<button
										type="button"
										onClick={copyUrl}
										aria-disabled={!canCopyOverlay}
										className={`rounded-full bg-gradient-to-r from-lime-200 to-cyan-200 px-4 py-2 text-[9px] font-black uppercase tracking-[0.15em] text-emerald-950 transition ${canCopyOverlay ? "hover:-translate-y-0.5" : "cursor-not-allowed opacity-35"}`}
									>
										{copied ? "URL kopiert" : "OBS-URL kopieren"}
									</button>
								</div>
							</div>
							<div className="themed-scrollbar min-h-[30rem] max-h-[67vh] overflow-auto bg-[linear-gradient(45deg,rgba(255,255,255,0.025)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.025)_75%),linear-gradient(45deg,rgba(255,255,255,0.025)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.025)_75%)] bg-[length:32px_32px] bg-[position:0_0,16px_16px] p-4">
								{canPreviewOverlay ? (
									<iframe
										src={previewUrl}
										title="Overlay Live Preview"
										className={`${config.style === "rail" ? "h-[800px]" : config.style === "freeform" ? "h-[720px]" : config.style === "portrait" ? "h-[440px]" : "h-[600px]"} w-[1280px] max-w-none border-0`}
									/>
								) : (
									<div className={`${config.style === "rail" ? "h-[800px]" : "h-[600px]"} grid w-[1280px] max-w-none place-items-center`}>
										<div className="max-w-md rounded-[2rem] border border-cyan-100/14 bg-[#07140d]/92 px-7 py-8 text-center shadow-2xl shadow-black/30">
											<div className="mx-auto grid size-12 place-items-center rounded-2xl border border-lime-200/18 bg-lime-200/[0.07] text-xl font-black text-lime-100">
												#
											</div>
											<h3 className="mt-4 text-xl font-black text-emerald-50">Riot-ID eingeben</h3>
											<p className="mt-2 text-sm leading-6 text-emerald-100/52">
												Sobald eine vollständige Riot-ID im Format Name#Tag eingetragen ist, laden wir hier die Live-Vorschau.
											</p>
										</div>
									</div>
								)}
							</div>
						</div>

						<details className="group mt-3 overflow-hidden rounded-[1.5rem] border border-lime-100/14 bg-gradient-to-br from-lime-200/[0.07] via-emerald-300/[0.03] to-cyan-300/[0.05] shadow-xl shadow-black/20">
							<summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 marker:content-none [&::-webkit-details-marker]:hidden">
								<div className="min-w-0">
									<div className="text-[8px] font-black uppercase tracking-[0.24em] text-lime-200/58">Browserquelle</div>
									<h3 className="mt-0.5 truncate text-sm font-black">URL ansehen oder bestehendes Overlay laden</h3>
								</div>
								<span
									className="grid size-8 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/20 text-emerald-100/55 transition group-open:rotate-180 group-open:border-lime-200/20 group-open:text-lime-100"
									aria-hidden="true"
								>
									<svg viewBox="0 0 20 20" className="size-4" fill="none">
										<path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
									</svg>
								</span>
							</summary>
							<div className="border-t border-white/8 px-4 pb-4 pt-4">
								<input
									readOnly
									value={
										canCopyOverlay ? overlayUrl : validRiotId ? "Stabile Riot-Account-ID wird ermittelt..." : "Bitte zuerst eine vollständige Riot-ID eingeben."
									}
									onFocus={(event) => event.currentTarget.select()}
									className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 font-mono text-[10px] text-emerald-100/62 outline-none focus:border-lime-200/35"
								/>
								<p className="mt-2 text-[11px] leading-5 text-emerald-100/46">
									In OBS als Browserquelle einfügen. Die empfohlene Größe steht direkt über der Vorschau.
								</p>

								<div className="mt-4 border-t border-white/9 pt-4">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<div>
											<div className="text-[8px] font-black uppercase tracking-[0.22em] text-lime-100/52">Meine Presets</div>
											<p className="mt-1 text-[10px] text-emerald-100/42">Bis zu zwölf Konfigurationen pro Lauchgruen-Konto.</p>
										</div>
										{presetSignedIn === false ? (
											<a
												href={accountUrl}
												className="rounded-xl border border-[#9146ff]/30 bg-[#9146ff]/12 px-3 py-2 text-[8px] font-black uppercase tracking-[0.15em] text-purple-100"
											>
												Anmelden
											</a>
										) : null}
									</div>
									{presetSignedIn ? (
										<>
											<div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
												<input
													value={presetName}
													onChange={(event) => setPresetName(event.target.value)}
													maxLength={48}
													placeholder="Preset-Name"
													className={inputClass}
												/>
												<button
													type="button"
													onClick={savePreset}
													disabled={!canCopyOverlay || !presetName.trim() || presetBusy}
													className="h-12 rounded-2xl bg-lime-200 px-4 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-950 transition disabled:cursor-not-allowed disabled:opacity-35"
												>
													{presetBusy ? "Speichert …" : "Preset speichern"}
												</button>
											</div>
											{presets.length ? (
												<div className="mt-3 grid gap-2 sm:grid-cols-2">
													{presets.map((preset) => (
														<div key={preset.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-white/9 bg-black/18 p-2">
															<button
																type="button"
																onClick={() => loadPreset(preset)}
																className="min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-left text-[10px] font-black text-emerald-50 transition hover:bg-white/[0.05]"
															>
																{preset.name}
															</button>
															<button
																type="button"
																onClick={() => deletePreset(preset)}
																aria-label={`${preset.name} löschen`}
																className="grid size-8 shrink-0 place-items-center rounded-lg border border-red-200/12 bg-red-400/[0.05] text-xs font-black text-red-100/55 transition hover:border-red-200/28 hover:text-red-100"
															>
																×
															</button>
														</div>
													))}
												</div>
											) : (
												<p className="mt-3 text-[10px] text-emerald-100/36">Noch keine Presets gespeichert.</p>
											)}
										</>
									) : null}
									{presetMessage ? (
										<p aria-live="polite" className="mt-2 text-[10px] font-bold text-lime-100/65">
											{presetMessage}
										</p>
									) : null}
								</div>

								<div className="mt-4 border-t border-white/9 pt-4">
									<div className="text-[8px] font-black uppercase tracking-[0.22em] text-cyan-100/52">Bestehende URL weiterbearbeiten</div>
									<form
										onSubmit={(event) => {
											event.preventDefault();
											importOverlayUrl();
										}}
										className="mt-2.5 grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_auto]"
									>
										<input
											value={existingUrl}
											onChange={(event) => {
												setExistingUrl(event.target.value);
												setImportMessage(null);
											}}
											placeholder="Bestehende OBS- oder Builder-URL einfügen"
											aria-label="Bestehende Overlay-URL"
											className={inputClass}
										/>
										<button
											type="submit"
											className="h-12 rounded-2xl border border-cyan-100/18 bg-cyan-200/[0.09] px-5 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-50 transition hover:border-cyan-100/38 hover:bg-cyan-200/[0.14]"
										>
											URL laden
										</button>
									</form>
									{importMessage ? (
										<div
											aria-live="polite"
											className={`mt-3 rounded-xl border px-3 py-2.5 text-[11px] font-bold leading-5 ${importMessage.tone === "success" ? "border-lime-200/20 bg-lime-200/[0.07] text-lime-50/75" : "border-rose-200/20 bg-rose-300/[0.07] text-rose-50/75"}`}
										>
											{importMessage.text}
										</div>
									) : (
										<p className="mt-2 text-[11px] leading-5 text-emerald-100/42">
											Lädt alle Einstellungen direkt aus den URL-Parametern. Es wird nichts gespeichert.
										</p>
									)}
								</div>
							</div>
						</details>
					</section>
				</div>
			</main>
		</div>
	);
}

function useDebouncedValue<T>(value: T, delayMs: number) {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = window.setTimeout(() => setDebounced(value), delayMs);
		return () => window.clearTimeout(timer);
	}, [delayMs, value]);
	return debounced;
}

function TwitchSearchResult({ lookup, selectedLogin, onSelect }: { lookup: TwitchLookup; selectedLogin: string; onSelect: (user: TwitchLookupUser) => void }) {
	if (lookup.status === "idle") {
		return <p className="text-[10px] leading-5 text-emerald-100/38">Optional. Ohne Twitch-Kanal werden nur Riot-Daten ohne Stream-Session angezeigt.</p>;
	}
	if (lookup.status === "loading") {
		return (
			<div aria-live="polite" className="flex items-center gap-2 rounded-xl border border-cyan-100/10 bg-cyan-200/[0.04] px-3 py-2.5 text-[10px] font-bold text-cyan-50/55">
				<span className="size-3 animate-spin rounded-full border-2 border-cyan-100/20 border-t-cyan-100/70" /> Suche nach @{lookup.login} …
			</div>
		);
	}
	if (lookup.status === "missing" || lookup.status === "error") {
		return (
			<div aria-live="polite" className="rounded-xl border border-rose-200/16 bg-rose-300/[0.06] px-3 py-2.5 text-[10px] font-bold leading-5 text-rose-50/68">
				{lookup.message}
			</div>
		);
	}

	const selected = selectedLogin === lookup.user.login;
	return (
		<button
			type="button"
			onClick={() => onSelect(lookup.user)}
			className={`group flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
				selected ? "border-lime-200/35 bg-lime-200/[0.09]" : "border-white/10 bg-black/20 hover:border-cyan-100/28 hover:bg-cyan-200/[0.06]"
			}`}
		>
			{/* Twitch avatars are user-controlled CDN assets and should bypass image optimization here. */}
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img src={lookup.user.profileImageUrl} alt="" className="size-11 shrink-0 rounded-xl border border-white/12 object-cover" />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate text-xs font-black text-emerald-50">{lookup.user.displayName}</span>
					<span className={`size-1.5 shrink-0 rounded-full ${lookup.live ? "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]" : "bg-emerald-100/22"}`} />
				</div>
				<div className="mt-1 truncate text-[9px] font-bold text-emerald-100/40">twitch.tv/{lookup.user.login}</div>
			</div>
			<span className={`shrink-0 text-[8px] font-black uppercase tracking-[0.15em] ${selected ? "text-lime-100" : "text-cyan-100/55 group-hover:text-cyan-100"}`}>
				{selected ? "Ausgewählt" : "Verwenden"}
			</span>
		</button>
	);
}

function Panel({ kicker, title, children, defaultOpen = false }: { kicker: string; title: string; children: React.ReactNode; defaultOpen?: boolean }) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<section
			className={`overflow-hidden rounded-[1.5rem] border bg-[#08170f]/90 shadow-xl shadow-black/20 backdrop-blur-xl transition ${open ? "border-lime-100/16" : "border-white/9 hover:border-white/15"}`}
		>
			<button
				type="button"
				onClick={() => setOpen((current) => !current)}
				aria-expanded={open}
				className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left"
			>
				<span className="min-w-0">
					<span className="block text-[8px] font-black uppercase tracking-[0.24em] text-lime-200/48">{kicker}</span>
					<span className="mt-0.5 block truncate text-sm font-black text-emerald-50">{title}</span>
				</span>
				<span
					className={`grid size-8 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/20 text-emerald-100/55 transition ${open ? "rotate-180 border-lime-200/20 text-lime-100" : ""}`}
					aria-hidden="true"
				>
					<svg viewBox="0 0 20 20" className="size-4" fill="none">
						<path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
					</svg>
				</span>
			</button>
			{open ? <div className="grid gap-4 border-t border-white/8 px-4 pb-4 pt-4">{children}</div> : null}
		</section>
	);
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
	return (
		<label className="grid gap-1.5">
			<span className="flex items-center justify-between gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-emerald-100/60">
				<span>{label}</span>
				{hint ? <span className="text-right normal-case tracking-normal text-emerald-100/34">{hint}</span> : null}
			</span>
			{children}
		</label>
	);
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
	return (
		<label className="rounded-xl border border-white/9 bg-black/20 p-2.5">
			<span className="text-[8px] font-black uppercase tracking-[0.17em] text-emerald-100/48">{label}</span>
			<div className="mt-2 flex items-center gap-2">
				<input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="size-8 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
				<span className="font-mono text-[10px] font-bold uppercase text-emerald-100/65">{value}</span>
			</div>
		</label>
	);
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
	return (
		<label className="rounded-xl border border-white/9 bg-black/20 p-2.5">
			<span className="text-[8px] font-black uppercase tracking-[0.17em] text-emerald-100/48">{label}</span>
			<input
				type="number"
				min={min}
				max={max}
				value={value}
				onChange={(event) => onChange(Math.max(min, Math.min(max, Number(event.target.value) || 0)))}
				className="mt-1 h-8 w-full appearance-none rounded-lg border border-white/8 bg-black/25 px-2 font-mono text-xs font-black text-emerald-50 outline-none [appearance:textfield] focus:border-cyan-200/35 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
			/>
		</label>
	);
}

function rankTierFromLabel(label: string) {
	const normalized = label.trim().toUpperCase();
	if (!normalized) return "";
	return Object.keys(RANK_TIER_LABELS).find((tier) => normalized.startsWith(tier) || normalized.startsWith(RANK_TIER_LABELS[tier].toUpperCase())) ?? "";
}

function Toggle({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
	return (
		<label
			className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/9 bg-black/18 px-3 py-2.5 text-xs font-bold text-emerald-100/72 transition hover:border-lime-200/20 ${disabled ? "cursor-not-allowed opacity-35" : ""}`}
		>
			<span>{label}</span>
			<input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
			<span className="relative h-5 w-9 shrink-0 rounded-full border border-white/12 bg-black/35 transition peer-checked:border-lime-200/40 peer-checked:bg-lime-300/25 after:absolute after:left-0.5 after:top-0.5 after:size-3.5 after:rounded-full after:bg-emerald-100/45 after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-lime-100" />
		</label>
	);
}

const inputClass =
	"h-12 w-full rounded-2xl border border-white/10 bg-[#07110c] px-4 text-sm font-bold text-emerald-50 outline-none transition placeholder:text-emerald-100/25 focus:border-lime-200/45 focus:ring-2 focus:ring-lime-200/10";

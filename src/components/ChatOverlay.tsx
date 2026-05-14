"use client";

/**
 * Read-only Twitch chat overlay with 7TV / BTTV / FFZ + Twitch-native emote support.
 *
 * Connects anonymously to Twitch IRC (no auth — uses the public `justinfan` flow),
 * pulls the channel's room-id from ROOMSTATE, then fetches emote sets from:
 *   - 7TV     (https://7tv.io/v3/users/twitch/<room-id>)
 *   - BTTV    (channel + global)
 *   - FFZ     (channel sets)
 *
 * Designed to be dropped into the OBS overlay below the host cam.
 * No external accounts, no cookies, no input box — just messages.
 */

import { useEffect, useRef, useState } from "react";

interface MessagePart {
  type: "text" | "emote";
  content: string;
  url?: string;
}

interface ChatMessage {
  id: string;
  username: string;
  color: string;
  parts: MessagePart[];
}

interface Props {
  /** Twitch login (lowercase). Empty/null means render nothing. */
  channel: string | null | undefined;
  /** Cap retained messages so memory doesn't grow forever. */
  maxMessages?: number;
}

// Default Twitch chat colors are sometimes too dark on a dark BG; brighten low-luma colors.
function ensureReadable(hex: string): string {
  if (!hex || !hex.startsWith("#") || hex.length !== 7) return "#9ee9d6";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luma > 90) return hex;
  // brighten by mixing 60% toward #fff
  const br = Math.round(r + (255 - r) * 0.6);
  const bg = Math.round(g + (255 - g) * 0.6);
  const bb = Math.round(b + (255 - b) * 0.6);
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(br)}${toHex(bg)}${toHex(bb)}`;
}

interface IrcLine {
  tags: Record<string, string>;
  prefix: string;
  command: string;
  params: string;
}

function parseIrcLine(line: string): IrcLine | null {
  let rest = line;
  const tags: Record<string, string> = {};
  if (rest.startsWith("@")) {
    const space = rest.indexOf(" ");
    if (space === -1) return null;
    const tagStr = rest.slice(1, space);
    rest = rest.slice(space + 1);
    for (const kv of tagStr.split(";")) {
      const eq = kv.indexOf("=");
      if (eq === -1) tags[kv] = "";
      else tags[kv.slice(0, eq)] = kv.slice(eq + 1);
    }
  }
  // Some commands (PING) have no prefix.
  if (rest.startsWith(":")) {
    const m = rest.match(/^:(\S+) (\S+) ?(.*)$/);
    if (!m) return null;
    return { tags, prefix: m[1], command: m[2], params: m[3] };
  } else {
    const m = rest.match(/^(\S+) ?(.*)$/);
    if (!m) return null;
    return { tags, prefix: "", command: m[1], params: m[2] };
  }
}

async function fetchAllEmotes(roomId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const add7tvEmotes = (
    emotes: Array<{
      name: string;
      data?: { host?: { url?: string; files?: Array<{ name: string }> } };
    }>,
  ) => {
    for (const e of emotes) {
      const host = e.data?.host;
      if (!host?.url) continue;
      const file =
        host.files?.find((f) => f.name === "1x.webp")?.name ??
        host.files?.[0]?.name ??
        "1x.webp";
      const baseUrl = host.url.startsWith("//") ? `https:${host.url}` : host.url;
      map.set(e.name, `${baseUrl}/${file}`);
    }
  };

  // ── 7TV ────────────────────────────────────────────────────────────────
  try {
    const r = await fetch(`https://7tv.io/v3/users/twitch/${roomId}`);
    if (r.ok) {
      const data = (await r.json()) as {
        emote_set?: {
          emotes?: Array<{
            name: string;
            data?: { host?: { url?: string; files?: Array<{ name: string }> } };
          }>;
        };
      };
      add7tvEmotes(data.emote_set?.emotes ?? []);
    }
  } catch {
    /* network errors are non-fatal — chat still works without emotes */
  }

  // ── 7TV global ────────────────────────────────────────────────────────
  try {
    const r = await fetch("https://7tv.io/v3/emote-sets/global");
    if (r.ok) {
      const data = (await r.json()) as {
        emotes?: Array<{
          name: string;
          data?: { host?: { url?: string; files?: Array<{ name: string }> } };
        }>;
      };
      add7tvEmotes(data.emotes ?? []);
    }
  } catch {
    /* ignore */
  }

  // ── BTTV channel ───────────────────────────────────────────────────────
  try {
    const r = await fetch(`https://api.betterttv.net/3/cached/users/twitch/${roomId}`);
    if (r.ok) {
      const data = (await r.json()) as {
        channelEmotes?: Array<{ id: string; code: string }>;
        sharedEmotes?: Array<{ id: string; code: string }>;
      };
      for (const e of [
        ...(data.channelEmotes ?? []),
        ...(data.sharedEmotes ?? []),
      ]) {
        map.set(e.code, `https://cdn.betterttv.net/emote/${e.id}/1x.webp`);
      }
    }
  } catch {
    /* ignore */
  }

  // ── BTTV global ────────────────────────────────────────────────────────
  try {
    const r = await fetch(`https://api.betterttv.net/3/cached/emotes/global`);
    if (r.ok) {
      const data = (await r.json()) as Array<{ id: string; code: string }>;
      for (const e of data) {
        if (!map.has(e.code)) {
          map.set(e.code, `https://cdn.betterttv.net/emote/${e.id}/1x.webp`);
        }
      }
    }
  } catch {
    /* ignore */
  }

  // ── FFZ ────────────────────────────────────────────────────────────────
  try {
    const r = await fetch(`https://api.frankerfacez.com/v1/room/id/${roomId}`);
    if (r.ok) {
      const data = (await r.json()) as {
        room?: { set?: number };
        sets?: Record<string, { emoticons?: Array<{ name: string; urls?: Record<string, string> }> }>;
      };
      const setId = data.room?.set;
      const set = setId != null ? data.sets?.[String(setId)] : null;
      for (const e of set?.emoticons ?? []) {
        const url = e.urls?.["1"] ?? Object.values(e.urls ?? {})[0];
        if (!url) continue;
        const full = url.startsWith("//") ? `https:${url}` : url;
        if (!map.has(e.name)) map.set(e.name, full);
      }
    }
  } catch {
    /* ignore */
  }

  return map;
}

/**
 * Tokenize a chat message into text + emote parts.
 *
 * Twitch's `emotes` tag is the source of truth for native emotes (with positions),
 * so we use it first. Remaining words are checked against the 3rd-party map.
 */
function tokenizeMessage(
  text: string,
  twitchEmotesTag: string,
  thirdPartyEmotes: Map<string, string>,
): MessagePart[] {
  // Position → twitch emote URL
  const twitchPositions = new Map<number, { len: number; url: string }>();
  if (twitchEmotesTag) {
    for (const item of twitchEmotesTag.split("/")) {
      if (!item) continue;
      const [id, positions] = item.split(":");
      if (!id || !positions) continue;
      const url = `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0`;
      for (const range of positions.split(",")) {
        const [s, e] = range.split("-").map(Number);
        if (Number.isFinite(s) && Number.isFinite(e)) {
          twitchPositions.set(s, { len: e - s + 1, url });
        }
      }
    }
  }

  const parts: MessagePart[] = [];
  // We need to walk the text by code-point index because Twitch positions are
  // code-point-based, not byte-based. For typical chat (mostly ASCII + emoji)
  // we can just iterate using Array.from to get an array of code points.
  const codepoints = Array.from(text);

  let i = 0;
  let textBuffer = "";
  const flushText = () => {
    if (textBuffer) {
      parts.push({ type: "text", content: textBuffer });
      textBuffer = "";
    }
  };

  while (i < codepoints.length) {
    const native = twitchPositions.get(i);
    if (native) {
      flushText();
      const name = codepoints.slice(i, i + native.len).join("");
      parts.push({ type: "emote", content: name, url: native.url });
      i += native.len;
      continue;
    }

    // Try to read a word starting at i (until whitespace).
    const ws = /\s/;
    if (ws.test(codepoints[i])) {
      textBuffer += codepoints[i];
      i++;
      continue;
    }
    let j = i;
    while (j < codepoints.length && !ws.test(codepoints[j])) j++;
    const word = codepoints.slice(i, j).join("");
    const url = thirdPartyEmotes.get(word);
    if (url) {
      flushText();
      parts.push({ type: "emote", content: word, url });
    } else {
      textBuffer += word;
    }
    i = j;
  }
  flushText();
  return parts;
}

export function ChatOverlay({ channel, maxMessages = 80 }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const emotesRef = useRef<Map<string, string>>(new Map());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!channel) {
      setMessages([]);
      emotesRef.current = new Map();
      return;
    }

    let cancelled = false;
    let ws: WebSocket | null = null;
    let roomIdFetched = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");

      ws.onopen = () => {
        if (!ws || cancelled) return;
        ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
        ws.send("PASS SCHMOOPIIE");
        ws.send(`NICK justinfan${Math.floor(Math.random() * 100000)}`);
        ws.send(`JOIN #${channel.toLowerCase()}`);
      };

      ws.onmessage = (ev) => {
        if (cancelled) return;
        const raw = String(ev.data);
        for (const line of raw.split("\r\n")) {
          if (!line) continue;

          // Twitch sends PING every ~5min; we must PONG back to stay connected.
          if (line.startsWith("PING")) {
            ws?.send(line.replace("PING", "PONG"));
            continue;
          }

          const parsed = parseIrcLine(line);
          if (!parsed) continue;

          if (
            parsed.command === "ROOMSTATE" &&
            parsed.tags["room-id"] &&
            !roomIdFetched
          ) {
            roomIdFetched = true;
            const rid = parsed.tags["room-id"];
            void fetchAllEmotes(rid).then((m) => {
              if (!cancelled) emotesRef.current = m;
            });
            continue;
          }

          if (parsed.command === "PRIVMSG") {
            // params is "#channel :message body"
            const colonIdx = parsed.params.indexOf(":");
            if (colonIdx === -1) continue;
            const text = parsed.params.slice(colonIdx + 1);
            const username =
              parsed.tags["display-name"] ||
              parsed.prefix.split("!")[0] ||
              "anon";
            const color = ensureReadable(parsed.tags["color"] || "");
            const id =
              parsed.tags["id"] || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const parts = tokenizeMessage(
              text,
              parsed.tags["emotes"] ?? "",
              emotesRef.current,
            );

            setMessages((prev) => {
              const next = [...prev, { id, username, color, parts }];
              while (next.length > maxMessages) next.shift();
              return next;
            });
          }
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        // Auto-reconnect after 2s if Twitch drops us.
        reconnectTimer = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        // Let onclose handle the reconnect.
        ws?.close();
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [channel, maxMessages]);

  // Auto-scroll on new messages.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  if (!channel) return null;

  return (
    <div
      ref={scrollRef}
      className="qd-chat-scroll h-full w-full overflow-y-auto px-3 py-2 text-sm font-medium leading-snug"
      style={{
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      <style>{`
        .qd-chat-scroll::-webkit-scrollbar { display: none; }
      `}</style>
      {messages.map((m) => (
        <div
          key={m.id}
          className="mb-1 break-words text-emerald-50/95"
          style={{ wordBreak: "break-word" }}
        >
          <span
            className="font-extrabold drop-shadow"
            style={{ color: m.color }}
          >
            {m.username}
          </span>
          <span className="text-emerald-300/70">: </span>
          {m.parts.map((p, i) =>
            p.type === "emote" && p.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={p.url}
                alt={p.content}
                title={p.content}
                className="inline-block align-middle"
                style={{ height: "1.6em", verticalAlign: "middle" }}
              />
            ) : (
              <span key={i}>{p.content}</span>
            ),
          )}
        </div>
      ))}
    </div>
  );
}

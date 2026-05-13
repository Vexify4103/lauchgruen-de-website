"use client";

/**
 * Question image with 16:9 preview and click-to-toggle fullscreen lightbox.
 *
 * The lightbox state lives client-side (per viewer), so each person — host,
 * contestants, OBS — can independently zoom in/out without affecting anyone
 * else. Click the preview to enlarge, click anywhere (or ✕) to shrink back.
 *
 * Falls back to a placeholder if the image 404s, so missing assets don't
 * look like the UI is broken — they show "image failed to load".
 */

import { useState } from "react";

interface Props {
  src: string;
  alt?: string;
}

export function QuestionImage({ src, alt = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="w-full aspect-video bg-emerald-950/60 border-2 border-red-700/50 rounded-xl flex items-center justify-center text-red-300 text-xs font-mono p-3">
        ⚠ Bild konnte nicht geladen werden:
        <span className="ml-1 text-red-200 truncate max-w-full">{src}</span>
      </div>
    );
  }

  return (
    <>
      {/* 16:9 preview — same aspect as participant cameras */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative w-full aspect-video rounded-xl overflow-hidden border-2 border-emerald-700/60 hover:border-amber-400/80 transition-all cursor-zoom-in shadow-lg block bg-emerald-950"
        aria-label="Bild vergrößern"
      >
        {/* Skeleton shown until the image loads */}
        {!loaded && (
          <div className="absolute inset-0 bg-emerald-900/40 animate-pulse flex items-center justify-center">
            <div className="text-emerald-700 text-sm">⏳</div>
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={[
            "absolute inset-0 w-full h-full object-cover transition-all group-hover:scale-[1.02]",
            loaded ? "opacity-100" : "opacity-0",
          ].join(" ")}
          draggable={false}
        />
        {/* Subtle hover hint */}
        <div className="absolute inset-0 bg-emerald-950/0 group-hover:bg-emerald-950/15 transition-colors flex items-end justify-end p-2">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity text-amber-300 text-xs font-bold bg-emerald-950/80 px-2 py-1 rounded">
            🔍 Klicken zum Vergrößern
          </div>
        </div>
      </button>

      {/* Fullscreen lightbox */}
      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/95 cursor-zoom-out p-6"
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="max-w-[95vw] max-h-[95vh] rounded-xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute top-4 right-4 w-12 h-12 rounded-full bg-emerald-950/80 hover:bg-emerald-900 border-2 border-amber-400/60 text-amber-300 text-2xl font-bold flex items-center justify-center transition-colors"
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>
      ) : null}
    </>
  );
}

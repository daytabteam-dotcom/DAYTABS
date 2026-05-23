import React, { useEffect, useMemo, useState } from "react";
import { PanelCardSoft } from "@/components/panel-system";
import { listCineStyles } from "../cineStudioApi";
import type { CineStyle, CineStylePreset } from "../types";

const BUILTIN: CineStylePreset[] = [
  "Hollywood Realism",
  "Documentary Realism",
  "Dark Cinematic",
  "Anime Cinematic",
  "Historical Realism",
  "Educational YouTube",
  "Fantasy Realism",
];

export type StyleSelection =
  | { kind: "none"; styleId: null; stylePreset: CineStylePreset }
  | { kind: "builtin"; styleId: null; stylePreset: CineStylePreset }
  | { kind: "user"; styleId: string; stylePreset: CineStylePreset };

export function StyleSelector({
  value,
  onChange,
  label = "Style",
  helper,
}: {
  value: StyleSelection;
  onChange: (next: StyleSelection) => void;
  label?: string;
  helper?: string;
}) {
  const [styles, setStyles] = useState<CineStyle[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    listCineStyles()
      .then((res) => {
        if (!mounted) return;
        setStyles(res.styles ?? []);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load styles");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const options = useMemo(() => {
    return [
      { value: "none", label: "No saved style" },
      ...BUILTIN.map((p) => ({ value: `builtin:${p}`, label: `Built-in · ${p}` })),
      ...(styles.map((s) => ({ value: `style:${s.id}`, label: `Saved · ${s.name}` }))),
    ];
  }, [styles]);

  const selectedValue =
    value.kind === "none" ? "none"
      : value.kind === "builtin" ? `builtin:${value.stylePreset}`
      : `style:${value.styleId}`;

  function handleChange(raw: string) {
    if (raw === "none") {
      onChange({ kind: "none", styleId: null, stylePreset: value.stylePreset });
      return;
    }
    if (raw.startsWith("builtin:")) {
      const preset = raw.slice("builtin:".length) as CineStylePreset;
      onChange({ kind: "builtin", styleId: null, stylePreset: preset });
      return;
    }
    if (raw.startsWith("style:")) {
      const id = raw.slice("style:".length);
      onChange({ kind: "user", styleId: id, stylePreset: value.stylePreset });
      return;
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="block text-xs text-white/50">{label}</label>
      <select
        value={selectedValue}
        onChange={(e) => handleChange(e.target.value)}
        className="panel-input w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 text-white/80"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {helper ? <p className="text-[11px] text-white/40">{helper}</p> : null}
      {error ? <PanelCardSoft className="mt-2 p-3 text-xs text-red-300">{error}</PanelCardSoft> : null}
    </div>
  );
}


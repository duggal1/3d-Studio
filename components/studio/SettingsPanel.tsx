"use client";

import type { RenderSettings } from "@/types/studio";

interface SettingsPanelProps {
  settings: RenderSettings;
  onChange: (settings: RenderSettings) => void;
}

function Slider({
  label,
  value,
  onValue,
  format,
}: {
  label: string;
  value: number;
  onValue: (value: number) => void;
  format: (value: number) => string;
}) {
  return (
    <label className="flex items-center gap-3 px-3 py-2">
      <span className="w-16 shrink-0 text-[11px] text-white/52">{label}</span>
      <input
        className="slider min-w-0 flex-1"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        aria-label={label}
        onChange={(event) => onValue(Number(event.target.value))}
      />
      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-white/34">
        {format(value)}
      </span>
    </label>
  );
}

export default function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  return (
    <section className="glass pointer-events-auto absolute bottom-[62px] right-4 z-20 w-[248px] overflow-hidden rounded-none">
      <div className="border-b border-white/10 px-3 py-2 text-[11px] text-white/52">
        Lighting
      </div>
      <div className="py-1">
        <Slider
          label="Shadow"
          value={settings.shadow}
          onValue={(shadow) => onChange({ ...settings, shadow })}
          format={(value) => `${Math.round(value * 100)}%`}
        />
        <Slider
          label="Reflection"
          value={settings.reflection}
          onValue={(reflection) => onChange({ ...settings, reflection })}
          format={(value) => `${Math.round(value * 100)}%`}
        />
      </div>
    </section>
  );
}

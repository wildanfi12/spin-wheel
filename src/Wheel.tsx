import { forwardRef } from "react";
import {
  Shirt,
  Ticket,
  Headphones,
  Usb,
  Umbrella,
  Gift,
  Trophy,
  Tv,
  Cable,
} from "lucide-react";
import type { Prize } from "./model";
import type { Phase } from "./interaction";

export function PrizeIcon({
  icon,
  size = 28,
}: {
  icon: string;
  size?: number;
}) {
  const Icon =
    (
      {
        shirt: Shirt,
        ticket: Ticket,
        headphones: Headphones,
        cable: Cable,
        usb: Usb,
        umbrella: Umbrella,
        trophy: Trophy,
        hdmi: Tv,
        tv: Tv,
      } as Record<string, typeof Gift>
    )[icon] || Gift;
  return <Icon size={size} strokeWidth={1.5} />;
}

export const Wheel = forwardRef<
  SVGSVGElement,
  {
    segments: string[];
    prizes: Prize[];
    rotation?: number;
    logo?: string;
    progress: number;
    phase: Phase;
    winner?: number;
  }
>(function Wheel(
  { segments, prizes, rotation = 0, logo, progress, phase, winner },
  ref,
) {
  const n = segments.length;
  return (
    <div className="wheel-shell">
      <div className="pointer">
        <span />
      </div>
      <svg viewBox="0 0 600 600" className="wheel-rim" aria-hidden="true">
        <defs>
          <linearGradient id="metal" x2="1" y2="1">
            <stop stopColor="#777" />
            <stop offset=".2" stopColor="#292929" />
            <stop offset=".5" stopColor="#555" />
            <stop offset=".75" stopColor="#151515" />
            <stop offset="1" stopColor="#777" />
          </linearGradient>
        </defs>
        <circle
          cx="300"
          cy="300"
          r="295"
          fill="#111"
          stroke="url(#metal)"
          strokeWidth="10"
        />
        <circle
          cx="300"
          cy="300"
          r="269"
          fill="none"
          stroke="#555"
          strokeWidth="2"
        />
        {Array.from({ length: 60 }, (_, i) => {
          const a = (i * Math.PI * 2) / 60;
          return (
            <circle
              className={"led " + (progress * 60 > i ? "lit" : "")}
              style={{ animationDelay: `${i * 35}ms` }}
              key={i}
              cx={300 + 282 * Math.sin(a)}
              cy={300 - 282 * Math.cos(a)}
              r="3"
            />
          );
        })}
        <circle className="energy-track" cx="300" cy="300" r="298" />
        <circle
          className="energy-ring"
          cx="300"
          cy="300"
          r="298"
          pathLength="100"
          strokeDasharray={`${progress * 100} 100`}
          transform="rotate(-90 300 300)"
        />
      </svg>
      <svg
        ref={ref}
        viewBox="0 0 600 600"
        className="wheel-disc"
        style={{ transform: `rotate(${rotation}deg)` }}
        role="img"
        aria-label={`Roda hadiah dengan ${n} segmen`}
      >
        {segments.map((id, i) => {
          const p = prizes.find((x) => x.id === id)!;
          const angle = 360 / n,
            a = ((i * angle - angle / 2 - 90) * Math.PI) / 180,
            b = ((i * angle + angle / 2 - 90) * Math.PI) / 180;
          const yellow = i % 2 === 0;
          const lines =
            p.wheelLines ||
            (p.name.includes("\n") ? p.name.split("\n") : p.name.split(" "));
          const hasLongLine = lines.some((l) => l.length > 8);
          return (
            <g key={i}>
              <path
                className={winner === i ? "winning-segment" : ""}
                d={`M300 300 L${300 + 264 * Math.cos(a)} ${300 + 264 * Math.sin(a)} A264 264 0 ${angle > 180 ? 1 : 0} 1 ${300 + 264 * Math.cos(b)} ${300 + 264 * Math.sin(b)} Z`}
                fill={yellow ? "#FFD600" : "#FFFFFF"}
                stroke="#9f8b2e"
                strokeWidth="1"
              />
              <g
                transform={`rotate(${i * angle} 300 300)`}
                fill="#141414"
              >
                <text
                  x="300"
                  y={lines.length > 2 ? 74 : 80}
                  textAnchor="middle"
                  fontSize={hasLongLine ? "11" : "12.5"}
                  fontWeight="800"
                >
                  {lines.map((w, j) => (
                    <tspan key={j} x="300" dy={j ? 15 : 0}>
                      {w}
                    </tspan>
                  ))}
                </text>
                {p.image ? (
                  <image
                    href={p.image}
                    x="274"
                    y="140"
                    width="52"
                    height="52"
                    preserveAspectRatio="xMidYMid meet"
                  />
                ) : (
                  <g
                    className="segment-icon"
                    transform="translate(281 148)"
                    aria-hidden="true"
                  >
                    <PrizeIcon icon={p.icon} size={38} />
                  </g>
                )}
              </g>
            </g>
          );
        })}
      </svg>
      <div className="hub">
        <img
          src={logo || `${import.meta.env.BASE_URL}assets/howell-white.png`}
          alt="HOWELL"
        />
        <span>{phase === "READY" ? "FULL POWER" : "SPIN & WIN"}</span>
      </div>
    </div>
  );
});

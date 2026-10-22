import { forwardRef } from "react";
import { Shirt, Ticket, Headphones, Usb, Umbrella, Gift } from "lucide-react";
import type { Prize } from "./model";
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
        cable: Usb,
        umbrella: Umbrella,
      } as Record<string, typeof Gift>
    )[icon] || Gift;
  return <Icon size={size} strokeWidth={1.5} />;
}
export const Wheel = forwardRef<
  SVGSVGElement,
  { segments: string[]; prizes: Prize[]; rotation?: number; logo?: string }
>(function Wheel({ segments, prizes, rotation = 0, logo }, ref) {
  const n = segments.length;
  return (
    <div className="wheel-shell">
      <div className="pointer" />
      <svg viewBox="0 0 600 600" className="wheel-rim" aria-hidden="true">
        <circle
          cx="300"
          cy="300"
          r="292"
          fill="#171717"
          stroke="#c6a723"
          strokeWidth="5"
        />
        {Array.from({ length: 50 }, (_, i) => {
          const a = (i * Math.PI * 2) / 50;
          return (
            <circle
              key={i}
              cx={300 + 281 * Math.sin(a)}
              cy={300 - 281 * Math.cos(a)}
              r="3.3"
              fill={i % 2 ? "#fff7b0" : "#ffd600"}
            />
          );
        })}
      </svg>
      <svg
        ref={ref}
        viewBox="0 0 600 600"
        className="wheel-disc"
        style={{ transform: `rotate(${rotation}deg)` }}
        role="img"
        aria-label={`Roda hadiah, ${n} segmen. Daftar hadiah dan peluang tersedia di bawah.`}
      >
        {segments.map((id, i) => {
          const p = prizes.find((x) => x.id === id)!;
          const angle = 360 / n;
          const a = ((i * angle - angle / 2 - 90) * Math.PI) / 180,
            b = ((i * angle + angle / 2 - 90) * Math.PI) / 180;
          const fill = ["#FFD600", "#171717", "#f5f5f5"][i % 3];
          return (
            <g key={i}>
              <path
                d={
                  n === 1
                    ? "M300 36 A264 264 0 1 1 300 564 A264 264 0 1 1 300 36"
                    : `M300 300 L${300 + 264 * Math.cos(a)} ${300 + 264 * Math.sin(a)} A264 264 0 ${angle > 180 ? 1 : 0} 1 ${300 + 264 * Math.cos(b)} ${300 + 264 * Math.sin(b)} Z`
                }
                fill={fill}
                stroke="#887931"
                strokeWidth="1"
              />
              <g transform={`rotate(${i * angle} 300 300)`}>
                <g
                  data-label-angle={i * angle}
                  transform={`rotate(${-i * angle - rotation} 300 140)`}
                  fill={fill === "#171717" ? "white" : "#111"}
                >
                  <text
                    x="300"
                    y="117"
                    textAnchor="middle"
                    fontSize={n > 12 ? 10 : 13}
                    fontWeight="800"
                  >
                    {p.name
                      .replace(" HOWELL", "")
                      .split(" ")
                      .map((w, j) => (
                        <tspan key={j} x="300" dy={j ? 14 : 0}>
                          {w}
                        </tspan>
                      ))}
                  </text>
                  {p.image ? (
                    <image
                      href={p.image}
                      x="287"
                      y="149"
                      width="26"
                      height="26"
                    />
                  ) : (
                    <foreignObject x="287" y="149" width="26" height="26">
                      <div
                        style={{ color: fill === "#171717" ? "white" : "#111" }}
                      >
                        <PrizeIcon icon={p.icon} size={26} />
                      </div>
                    </foreignObject>
                  )}
                </g>
              </g>
            </g>
          );
        })}
        <circle
          cx="300"
          cy="300"
          r="69"
          fill="#111"
          stroke="#e5bf18"
          strokeWidth="5"
        />
      </svg>
      <div className="hub">
        <img
          src={logo || `${import.meta.env.BASE_URL}assets/howell-white.png`}
          alt="HOWELL"
        />
        <span>SPIN & WIN</span>
      </div>
    </div>
  );
});

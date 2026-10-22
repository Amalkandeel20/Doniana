import { LOGO_SRC } from "@/lib/placeholders";
import { cn } from "@/lib/utils";

// The supplied artwork is 1536×1024 with wide black margins; the mark itself sits roughly in
// x 400–1100, y 20–860. We frame that region without editing, recolouring or redrawing the file.
const CROP = { x: 400, y: 20, w: 700, h: 840, imgW: 1536 };

/**
 * The client's official logo, unaltered. Its lettering is dark on black, so it is always shown on
 * a pure-black surface. Size it by height (e.g. `h-14`); the width follows the mark's aspect.
 */
export function Logo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <span className={cn("relative block aspect-[700/840] overflow-hidden bg-black", className)}>
      <img
        src={LOGO_SRC}
        alt="DONIANA — Piercing & Eyebrows Lamination"
        width={1536}
        height={1024}
        decoding="async"
        {...{ fetchpriority: priority ? "high" : "auto" }}
        className="absolute max-w-none"
        style={{
          width: `${(CROP.imgW / CROP.w) * 100}%`,
          left: `${(-CROP.x / CROP.w) * 100}%`,
          top: `${(-CROP.y / CROP.h) * 100}%`,
        }}
      />
    </span>
  );
}

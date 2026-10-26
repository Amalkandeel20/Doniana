import { LOGO_SRC } from "@/lib/placeholders";
import { cn } from "@/lib/utils";

// The supplied artwork (white lettering, 1536×1024 on black) spans x 247–1301, y 44–958. We frame
// that region with an even ~30px margin so the mark is optically centred, without editing,
// recolouring or redrawing the file.
const CROP = { x: 217, y: 14, w: 1114, h: 974, imgW: 1536 };

/**
 * The client's official logo, unaltered, always on a black surface. Size it by height
 * (e.g. `h-14`); the width follows the mark's aspect ratio.
 */
export function Logo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <span className={cn("relative block overflow-hidden bg-black", className)} style={{ aspectRatio: `${CROP.w} / ${CROP.h}` }}>
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

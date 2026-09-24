import { Leaf } from "lucide-react";
import { assetSlot } from "@/lib/marketing/assets";
import { SalesVideo } from "@/components/marketing/sales-video";
import { MediaFrame } from "@/components/ui/media-frame";
import { cn } from "@/lib/utils";

/**
 * A photography slot. When the real asset from Adam's media library is set on
 * the manifest, this renders it through MediaFrame, so it picks up the shared
 * hover and scroll-reveal treatment. Until then it renders a branded panel
 * that names what is needed — never stock or AI imagery, per the photography
 * rule.
 */
export function PhotoSlot({
  id,
  className,
  aspect = "aspect-[4/3]",
  rounded = "rounded-[1.25rem]",
}: {
  id: string;
  className?: string;
  aspect?: string;
  rounded?: string;
}) {
  const slot = assetSlot(id);

  if (slot.src) {
    // Hover and reveal come from MediaFrame, which is why callers no longer
    // pass `vu-zoom` here — the treatment is the same on every photo on the
    // site whether or not a section remembered to ask for it.
    return (
      <MediaFrame
        src={slot.src}
        alt={slot.alt}
        aspect={aspect}
        rounded={rounded}
        imgClassName={className}
      />
    );
  }

  return (
    <div
      data-asset-needed={slot.id}
      className={cn(
        "relative flex flex-col items-center justify-center gap-2 overflow-hidden border border-dashed border-sand bg-mint/60 px-6 text-center",
        aspect,
        rounded,
        className,
      )}
    >
      <Leaf className="size-6 vu-leaf-drift text-accent/70" aria-hidden />
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-olive">
        Photo needed
      </p>
      <p className="vu-measure text-xs leading-relaxed text-foreground-muted">
        {slot.need}
      </p>
    </div>
  );
}

/**
 * The sales video slot. Portrait footage gets framed as a story-shaped card
 * rather than letterboxed into a 16:9 player.
 */
export function VideoSlot({ id, className }: { id: string; className?: string }) {
  const slot = assetSlot(id);
  const portrait = slot.orientation === "portrait";

  if (slot.src) {
    return (
      <figure
        className={cn(
          "mx-auto overflow-hidden rounded-[1.5rem] bg-black shadow-[0_24px_60px_rgba(0,0,0,0.22)]",
          portrait ? "w-full max-w-[22rem]" : "w-full",
          className,
        )}
      >
        <SalesVideo
          src={slot.src}
          portrait={portrait}
          label="Adam, talking straight to camera"
        />
      </figure>
    );
  }

  return (
    <div
      data-asset-needed={slot.id}
      className={cn(
        "mx-auto flex flex-col items-center justify-center gap-2 rounded-[1.5rem] border border-dashed border-sand bg-mint/60 px-6 text-center",
        portrait ? "aspect-[9/16] w-full max-w-[22rem]" : "aspect-video w-full",
        className,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-olive">
        Video needed
      </p>
      <p className="vu-measure text-xs leading-relaxed text-foreground-muted">
        {slot.need}
      </p>
    </div>
  );
}

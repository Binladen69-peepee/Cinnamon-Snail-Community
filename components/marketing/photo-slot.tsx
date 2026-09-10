import { Leaf } from "lucide-react";
import { assetSlot } from "@/lib/marketing/assets";
import { cn } from "@/lib/utils";

/**
 * A photography slot. When the real asset from Adam's media library is set on
 * the manifest, this renders it. Until then it renders a branded panel that
 * names what is needed — never stock or AI imagery, per the photography rule.
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
    return (
      <div className={cn("relative overflow-hidden", aspect, rounded, className)}>
        {/* Media-library URLs are arbitrary hosts, not optimizer inputs. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={slot.src}
          alt={slot.alt}
          className="size-full object-cover"
          loading="lazy"
        />
      </div>
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
      <Leaf className="size-6 text-accent/70 vu-leaf-drift" aria-hidden />
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-olive">
        Photo needed
      </p>
      <p className="prose-measure text-xs leading-relaxed text-foreground-muted">
        {slot.need}
      </p>
    </div>
  );
}

/** The sales video slot on /membership. */
export function VideoSlot({ id, className }: { id: string; className?: string }) {
  const slot = assetSlot(id);

  if (slot.src) {
    return (
      <div className={cn("overflow-hidden rounded-[1.25rem] bg-black", className)}>
        <video
          src={slot.src}
          controls
          playsInline
          preload="metadata"
          className="aspect-video w-full"
        />
      </div>
    );
  }

  return (
    <div
      data-asset-needed={slot.id}
      className={cn(
        "flex aspect-video flex-col items-center justify-center gap-2 rounded-[1.25rem] border border-dashed border-sand bg-mint/60 px-6 text-center",
        className,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-olive">
        Video needed
      </p>
      <p className="prose-measure text-xs leading-relaxed text-foreground-muted">
        {slot.need}
      </p>
    </div>
  );
}

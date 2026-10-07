"use client";

import { useId } from "react";
import { HardDrive, SwatchBook } from "lucide-react";
import { Accordion, AccordionItem } from "@/components/aceternity/accordion";
import { ModeSwitch } from "@/components/theme/mode-switch";
import { PaletteColours } from "@/components/theme/palette-colours";
import { PalettePicker } from "@/components/theme/palette-picker";
import { ThemePreview } from "@/components/theme/theme-preview";
import { setAccent, useAccent } from "@/lib/theme/accent";
import { paletteById } from "@/lib/theme/palettes";

/** Section labels, in the app's overline style. */
const LABEL = "text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted";

/**
 * The body of the Theme dialog: the mode, the palette, a preview, and the
 * details. Everything applies as it is chosen, so there is nothing to submit;
 * the dialog re-themes along with the page behind it.
 */
export function ThemePanel({
  onAnnounce = () => {},
}: {
  /** Speaks a short message through the dialog's live region. */
  onAnnounce?: (message: string) => void;
}) {
  const accent = useAccent();
  const palette = paletteById(accent);
  const id = useId();
  const modeLabel = `${id}-mode`;
  const paletteLabel = `${id}-palette`;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-2.5">
        <h3 id={modeLabel} className={LABEL}>
          Mode
        </h3>
        <ModeSwitch labelledBy={modeLabel} />
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id={paletteLabel} className={LABEL}>
            Palette
          </h3>
          <p className="text-caption text-foreground-muted">Applies as you choose</p>
        </div>
        <PalettePicker value={accent} onChange={setAccent} labelledBy={paletteLabel} />
      </div>

      <ThemePreview palette={palette} />

      <Accordion type="multiple">
        <AccordionItem value="colours" title="Palette colours" icon={<SwatchBook />}>
          <PaletteColours key={palette.id} palette={palette} onAnnounce={onAnnounce} />
        </AccordionItem>
        <AccordionItem value="saved" title="How this is saved" icon={<HardDrive />}>
          <p className="text-pretty">
            Your palette and mode are kept in this browser rather than in your account, so each
            device keeps its own. They apply to the member app and the admin console; the public
            site keeps the house colours.
          </p>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

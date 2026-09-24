import type { Metadata } from "next";
import Script from "next/script";
import {
  Caveat,
  Caveat_Brush,
  Fraunces,
  Inter,
  Momo_Trust_Display,
  Poppins,
} from "next/font/google";
import { Providers } from "@/app/providers";
import { MediaRevealRuntime } from "@/components/ui/media-reveal-runtime";
import { SAMCART_SLIDE_SCRIPT } from "@/lib/marketing/checkout";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  // 400 is all the marketing and member pages ask for -- they flatten every
  // weight class to regular on purpose. The admin console needs a real
  // hierarchy, and `font-synthesis: none` on body means a weight that is not
  // loaded cannot be faked: it would silently render as 400.
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/**
 * Display face for the "porcelain" look under evaluation. Loaded here so the
 * three candidate identities can be compared without a rebuild; it costs
 * nothing on pages that do not reference it.
 */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

/**
 * The hero headline's face: a bold brush script. Google ships it at 400 only,
 * which is its natural weight — a brush stroke has no lighter cut, and asking
 * the browser to synthesise a bolder one would double the strokes.
 */
const brush = Caveat_Brush({
  variable: "--font-brush",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const momo = Momo_Trust_Display({
  variable: "--font-momo",
  subsets: ["latin"],
  // Google ships Display at 400 only. Headings still request 700 in CSS so
  // the browser synthesizes the bold cut at h1–h3 size.
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Vegan University",
    template: "%s · Vegan University",
  },
  description:
    "A premium vegan cooking school and community. Learn, cook, and belong.",
  metadataBase: new URL(process.env.AUTH_URL ?? "http://localhost:3000"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${poppins.variable} ${caveat.variable} ${brush.variable} ${momo.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="relative min-h-full bg-background font-sans text-foreground">
        <Script src={SAMCART_SLIDE_SCRIPT} strategy="afterInteractive" />
        {/* One observer drives the reveal for every MediaFrame on the page. */}
        <MediaRevealRuntime />
        {/* The site-wide leaf backdrop is gone: a dozen absolutely-placed SVGs
            floating behind every page read as clutter rather than craft, and
            they were the first thing to overflow a phone. */}
        <div className="relative min-h-full">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}

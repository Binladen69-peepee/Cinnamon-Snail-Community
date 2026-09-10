export function BotanicalBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
      {LEAF_PLACEMENTS.map((leaf) => (
        <LeafCluster key={leaf.key} className={leaf.className} />
      ))}
    </div>
  );
}

const LEAF_PLACEMENTS = [
  {
    key: "tl",
    className:
      "absolute -left-8 top-[1%] w-[280px] text-accent opacity-[0.16] dark:opacity-[0.14]",
  },
  {
    key: "tr",
    className:
      "absolute -right-10 top-[3%] w-[240px] rotate-[22deg] text-accent opacity-[0.14] dark:opacity-[0.12]",
  },
  {
    key: "l14",
    className:
      "absolute left-[5%] top-[14%] w-[200px] rotate-[-18deg] text-forest opacity-[0.12] dark:opacity-[0.11]",
  },
  {
    key: "r18",
    className:
      "absolute -right-12 top-[18%] w-[220px] rotate-[8deg] text-forest opacity-[0.11] dark:opacity-[0.1]",
  },
  {
    key: "l28",
    className:
      "absolute -left-10 top-[28%] w-[250px] rotate-[14deg] text-accent opacity-[0.14] dark:opacity-[0.12]",
  },
  {
    key: "r32",
    className:
      "absolute right-[4%] top-[32%] w-[190px] rotate-[-12deg] text-forest opacity-[0.1] dark:opacity-[0.1]",
  },
  {
    key: "l42",
    className:
      "absolute left-[3%] top-[42%] w-[210px] -rotate-[10deg] text-accent opacity-[0.13] dark:opacity-[0.12]",
  },
  {
    key: "r46",
    className:
      "absolute -right-14 top-[46%] w-[240px] rotate-[16deg] text-accent opacity-[0.12] dark:opacity-[0.12]",
  },
  {
    key: "l56",
    className:
      "absolute -left-12 top-[56%] w-[230px] rotate-[6deg] text-forest opacity-[0.11] dark:opacity-[0.1]",
  },
  {
    key: "r60",
    className:
      "absolute right-[6%] top-[60%] w-[180px] rotate-[20deg] text-accent opacity-[0.1] dark:opacity-[0.1]",
  },
  {
    key: "l70",
    className:
      "absolute left-[4%] top-[70%] w-[240px] -rotate-12 text-accent opacity-[0.14] dark:opacity-[0.12]",
  },
  {
    key: "r74",
    className:
      "absolute -right-10 top-[74%] w-[210px] rotate-[10deg] text-forest opacity-[0.11] dark:opacity-[0.1]",
  },
  {
    key: "l84",
    className:
      "absolute -left-8 top-[84%] w-[260px] rotate-[12deg] text-forest opacity-[0.12] dark:opacity-[0.11]",
  },
  {
    key: "r88",
    className:
      "absolute right-[5%] top-[88%] w-[200px] -rotate-[16deg] text-accent opacity-[0.13] dark:opacity-[0.12]",
  },
  {
    key: "bl",
    className:
      "absolute -left-10 top-[96%] w-[240px] -rotate-[8deg] text-accent opacity-[0.12] dark:opacity-[0.11]",
  },
  {
    key: "br",
    className:
      "absolute -right-12 top-[96%] w-[220px] rotate-[18deg] text-forest opacity-[0.1] dark:opacity-[0.1]",
  },
];

export function LeafCluster({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 220" fill="none" className={className}>
      <path
        d="M40 170c18-42 48-78 92-102"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M78 88c-8-28 6-52 34-64 2 24-8 48-34 64Z"
        fill="currentColor"
      />
      <path
        d="M108 72c12-26 38-38 62-32-8 28-28 48-62 32Z"
        fill="currentColor"
      />
      <path
        d="M96 118c-18-22-18-48 2-70 18 18 28 42-2 70Z"
        fill="currentColor"
      />
      <path
        d="M128 128c8-30 32-48 58-50-4 30-24 52-58 50Z"
        fill="currentColor"
      />
      <path
        d="M70 142c-22-18-28-44-12-68 22 12 32 38 12 68Z"
        fill="currentColor"
      />
      <path
        d="M118 96c0 28-10 52-28 72"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HerbSprig({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 120" fill="none" className={className} aria-hidden>
      <path
        d="M32 114V18"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path d="M32 28c-14-8-22-4-26 8 12 2 22-2 26-8Z" fill="currentColor" />
      <path d="M32 28c14-8 22-4 26 8-12 2-22-2-26-8Z" fill="currentColor" opacity="0.72" />
      <path d="M32 48c-16-6-24 2-26 12 14 0 22-6 26-12Z" fill="currentColor" />
      <path d="M32 48c16-6 24 2 26 12-14 0-22-6-26-12Z" fill="currentColor" opacity="0.72" />
      <path d="M32 70c-15-5-22 4-24 12 13-1 20-6 24-12Z" fill="currentColor" />
      <path d="M32 70c15-5 22 4 24 12-13-1-20-6-24-12Z" fill="currentColor" opacity="0.72" />
      <path d="M32 90c-12-4-18 3-20 10 11 0 16-5 20-10Z" fill="currentColor" />
    </svg>
  );
}

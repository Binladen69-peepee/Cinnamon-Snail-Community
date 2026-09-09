export function BotanicalBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-[920px] overflow-hidden" aria-hidden>
      <LeafCluster className="absolute -left-8 -top-6 w-[280px] opacity-[0.14] text-accent" />
      <LeafCluster className="absolute left-[8%] top-[38%] w-[190px] rotate-[-18deg] opacity-[0.1] text-forest" />
      <LeafCluster className="absolute -right-10 top-8 w-[240px] rotate-[22deg] opacity-[0.12] text-accent" />
      <LeafCluster className="absolute bottom-[18%] right-[6%] w-[210px] rotate-[8deg] opacity-[0.09] text-forest" />
      <LeafCluster className="absolute -bottom-8 left-[18%] w-[260px] -rotate-12 opacity-[0.08] text-accent" />
    </div>
  );
}

function LeafCluster({ className }: { className?: string }) {
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
        stroke="#0F3D32"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path d="M32 28c-14-8-22-4-26 8 12 2 22-2 26-8Z" fill="#16A34A" />
      <path d="M32 28c14-8 22-4 26 8-12 2-22-2-26-8Z" fill="#0B513F" />
      <path d="M32 48c-16-6-24 2-26 12 14 0 22-6 26-12Z" fill="#16A34A" />
      <path d="M32 48c16-6 24 2 26 12-14 0-22-6-26-12Z" fill="#0F3D32" />
      <path d="M32 70c-15-5-22 4-24 12 13-1 20-6 24-12Z" fill="#16A34A" />
      <path d="M32 70c15-5 22 4 24 12-13-1-20-6-24-12Z" fill="#0B513F" />
      <path d="M32 90c-12-4-18 3-20 10 11 0 16-5 20-10Z" fill="#16A34A" />
    </svg>
  );
}

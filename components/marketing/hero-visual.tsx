import Image from "next/image";
import { HerbSprig } from "@/components/marketing/hero-decor";

export function HeroVisual() {
  return (
    <div className="hero-copy-reveal relative mx-auto aspect-square w-full max-w-[34rem] overflow-visible px-6 py-10 sm:px-10">
      <div className="relative z-10 overflow-hidden rounded-[28px] shadow-[0_20px_60px_rgba(15,61,50,0.08)]">
        <div className="relative aspect-square">
          <Image
            src="https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=1400&q=80"
            alt="A vibrant bowl of roasted vegetables, greens, and citrus"
            fill
            priority
            className="object-cover"
          />
        </div>
      </div>

      <div className="absolute -right-10 -top-10 z-20 hidden size-36 overflow-hidden rounded-full border-[6px] border-cream shadow-[0_10px_30px_rgba(15,61,50,0.08)] sm:block md:-right-14 md:size-44">
        <Image
          src="https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=600&q=80"
          alt=""
          fill
          className="object-cover"
        />
      </div>

      <HerbSprig className="absolute -left-6 top-[18%] z-20 w-10 rotate-[-28deg] sm:-left-8 sm:w-12" />
      <HerbSprig className="absolute -right-2 bottom-[22%] z-20 w-9 rotate-[18deg] sm:-right-4 sm:w-11" />
      <HerbSprig className="absolute bottom-[-6%] left-[18%] z-20 w-11 rotate-[-8deg]" />
      <HerbSprig className="absolute left-[42%] top-[-8%] z-20 w-8 rotate-[40deg] opacity-90" />

      <p className="font-hand absolute bottom-[14%] right-[6%] z-30 hidden max-w-[10ch] rotate-[-12deg] text-center text-[30px] leading-[1.02] font-semibold text-white sm:block md:text-[34px]">
        <span className="relative inline-block drop-shadow-[0_3px_10px_rgba(15,61,50,0.45)]">
          <svg viewBox="0 0 28 22" className="absolute -left-7 top-1 h-5 w-7 text-white" aria-hidden>
            <path d="M2 18L10 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M8 18L16 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M14 18L22 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Better food
          <br />
          Brighter Future ♡
          <svg viewBox="0 0 28 22" className="absolute -right-7 bottom-0 h-5 w-7 text-white" aria-hidden>
            <path d="M6 18L14 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M12 18L20 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M18 18L26 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
      </p>
    </div>
  );
}

export function HeadlineSwoosh() {
  return (
    <svg
      viewBox="0 0 240 18"
      className="absolute -bottom-1 left-0 w-[108%] max-w-none"
      aria-hidden
      fill="none"
    >
      <path
        d="M3 11C38 17 72 5 108 9C144 13 176 16 237 7"
        stroke="#16A34A"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M18 13C70 18 130 8 222 10"
        stroke="#16A34A"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

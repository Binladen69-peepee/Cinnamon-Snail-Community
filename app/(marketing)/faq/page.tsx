import { FaqAccordion } from "@/components/marketing/faq-accordion";

export default function FaqPage() {
  return (
    <article className="vu-gutter mx-auto max-w-3xl py-16">
      <h1 className="text-5xl font-extrabold tracking-tight text-foreground">
        Questions, answered <span className="text-accent">plainly</span>
      </h1>
      <p className="prose-measure mt-4 text-foreground-muted">
        Billing, access, and Kitchen Table — without dark patterns or invented
        policies.
      </p>
      <div className="mt-10">
        <FaqAccordion />
      </div>
    </article>
  );
}

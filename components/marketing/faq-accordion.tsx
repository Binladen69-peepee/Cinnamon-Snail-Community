"use client";

import { Accordion } from "@heroui/react/accordion";
import { ChevronDown } from "lucide-react";
import { HOMEPAGE_FAQS } from "@/lib/marketing/copy";

export function FaqAccordion() {
  return (
    <Accordion className="w-full border-t border-border">
      {HOMEPAGE_FAQS.map((item) => (
        <Accordion.Item key={item.question} className="border-b border-border">
          <Accordion.Heading>
            <Accordion.Trigger className="py-5 text-left text-base font-bold text-foreground">
              {item.question}
              <Accordion.Indicator>
                <ChevronDown className="size-4" aria-hidden />
              </Accordion.Indicator>
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body className="prose-measure pb-5 text-foreground-muted">
              {item.answer.map((paragraph) => (
                <p key={paragraph.slice(0, 32)} className="mt-3 first:mt-0">
                  {paragraph}
                </p>
              ))}
            </Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}

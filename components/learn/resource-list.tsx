import { ArrowUpRight, FileText } from "lucide-react";
import { Card } from "@/components/app/ui";

/**
 * A class's or a lesson's recipes and downloads: one card, one row each.
 *
 * The class page and the lesson page each had their own copy of this, as a
 * stack of separately bordered rows. They open in a new tab, as they always
 * did, because a recipe PDF is read beside the lesson rather than instead of it.
 */
export function ResourceList({
  resources,
}: {
  resources: { id: string; title: string; url: string }[];
}) {
  return (
    <Card as="div" padding="none" className="overflow-hidden">
      <ul className="divide-y divide-separator">
        {resources.map((resource) => (
          <li key={resource.id}>
            <a
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 px-4 py-3 text-body text-foreground no-underline transition hover:bg-surface-muted sm:px-5"
            >
              <FileText className="size-4 shrink-0 text-brand" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{resource.title}</span>
              <ArrowUpRight
                className="size-4 shrink-0 text-foreground-muted transition group-hover:text-foreground"
                aria-hidden
              />
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}

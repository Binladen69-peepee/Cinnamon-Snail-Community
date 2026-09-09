import { EmptyState } from "@/components/ui/empty-state";

export function LaterPhasePage({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return <EmptyState title={title} body={body} />;
}

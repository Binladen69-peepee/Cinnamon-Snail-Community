import { ListSkeleton, PageHeaderSkeleton } from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Roadmap tracks while they load: the header, the tracks, the new-track form. */
export default function RoadmapLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <PageHeaderSkeleton />
      <ListSkeleton rows={4} avatar={false} />
      <Skeleton className="h-48 w-full rounded-card" />
    </div>
  );
}

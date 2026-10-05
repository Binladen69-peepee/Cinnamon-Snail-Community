import { ListSkeleton, PageHeaderSkeleton } from "@/components/app/skeletons";

/** The variation queue while it loads. */
export default function VariationsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <PageHeaderSkeleton />
      <ListSkeleton rows={4} avatar={false} />
    </div>
  );
}

import { ChipRowSkeleton, ListSkeleton, PageHeaderSkeleton } from "@/components/app/skeletons";

/** The ideas console while it loads: the header, its filters, the list. */
export default function AdminIdeasLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-4">
        <PageHeaderSkeleton />
        <ChipRowSkeleton count={6} />
      </div>
      <ListSkeleton rows={5} avatar={false} />
    </div>
  );
}

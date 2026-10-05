import { ListSkeleton, PageHeaderSkeleton } from "@/components/app/skeletons";

/** Spaces while they load: the header and the table of rooms. */
export default function SpacesLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <PageHeaderSkeleton />
      <ListSkeleton rows={6} avatar={false} />
    </div>
  );
}

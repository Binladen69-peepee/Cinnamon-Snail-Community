import { ListSkeleton, PageHeaderSkeleton } from "@/components/app/skeletons";

/** Events while they load: the header with its action and the table. */
export default function EventsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <PageHeaderSkeleton actions />
      <ListSkeleton rows={6} avatar={false} />
    </div>
  );
}

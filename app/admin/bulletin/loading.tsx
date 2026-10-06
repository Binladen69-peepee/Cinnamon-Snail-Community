import { ListSkeleton, PageHeaderSkeleton } from "@/components/app/skeletons";

/** The bulletin queue while it loads: the header, its two review cards and the posts panel. */
export default function BulletinLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <PageHeaderSkeleton />
      <ListSkeleton rows={3} />
      <ListSkeleton rows={2} avatar={false} />
      <ListSkeleton rows={1} avatar={false} />
    </div>
  );
}

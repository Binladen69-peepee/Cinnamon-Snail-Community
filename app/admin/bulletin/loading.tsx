import { ListSkeleton, PageHeaderSkeleton } from "@/components/app/skeletons";

/** The bulletin queue while it loads: the header and its two review cards. */
export default function BulletinLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <PageHeaderSkeleton />
      <ListSkeleton rows={3} />
      <ListSkeleton rows={2} avatar={false} />
    </div>
  );
}

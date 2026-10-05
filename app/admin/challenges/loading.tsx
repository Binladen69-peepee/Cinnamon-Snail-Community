import { ListSkeleton, PageHeaderSkeleton } from "@/components/app/skeletons";

/** Challenges while they load. */
export default function ChallengesLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <PageHeaderSkeleton />
      <ListSkeleton rows={4} avatar={false} />
    </div>
  );
}

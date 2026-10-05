import { DetailIdleSkeleton } from "@/components/messages/skeletons";

/**
 * The detail pane while a messages page loads. The inbox beside it is the
 * layout's, with its own boundary, so only this half is stood in for.
 */
export default function MessagesLoading() {
  return <DetailIdleSkeleton />;
}

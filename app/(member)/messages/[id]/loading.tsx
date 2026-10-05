import { ThreadSkeleton } from "@/components/messages/skeletons";

/**
 * A thread while it loads. The header and composer are already in place, so
 * only the messages arrive.
 */
export default function ConversationLoading() {
  return <ThreadSkeleton />;
}

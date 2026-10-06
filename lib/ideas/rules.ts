import { VOTING_CLOSED_STATUSES, type IdeaStatusValue } from "@/lib/ideas/constants";

/**
 * Who may do what to an idea. Pure, so the server and the interface decide the
 * same way and the rules can be tested without a database.
 */

/**
 * The author's own vote.
 *
 * Reddit's rule, and Canny's: posting an idea counts as wanting it, so the
 * author's upvote is cast when the idea is submitted and it stays. A new idea
 * reads "1", the count means "members who want this", and the author cannot
 * vote for themselves a second time or take the vote back to game the order.
 * It also keeps merging simple: the duplicate's author wanted the thing too,
 * so their vote moves to the original like everybody else's.
 */
export const AUTHOR_VOTE_COUNTS = true;

export type VoteBlock = "own" | "closed" | "merged";

export const VOTE_BLOCK_MESSAGES: Record<VoteBlock, string> = {
  own: "This is your idea, so your vote is already counted.",
  closed: "Voting is closed on this idea.",
  merged: "This idea was merged into another one. Vote on that one instead.",
};

/** Why the viewer cannot change their vote on this idea, or null if they can. */
export function ideaVoteBlock(input: {
  isAuthor: boolean;
  status: IdeaStatusValue;
  merged: boolean;
}): VoteBlock | null {
  if (input.merged) return "merged";
  if (VOTING_CLOSED_STATUSES.includes(input.status)) return "closed";
  if (input.isAuthor) return "own";
  return null;
}

/**
 * The author may fix their idea while it is still open. Once the team has
 * picked it up, its wording is what everyone voted for, so it stays put.
 * Staff may correct anything.
 */
export function canEditIdea(input: {
  isAuthor: boolean;
  isStaff: boolean;
  status: IdeaStatusValue;
  merged: boolean;
}): boolean {
  if (input.isStaff) return true;
  return input.isAuthor && input.status === "OPEN" && !input.merged;
}

/**
 * The author may withdraw an idea nobody else has joined yet. Once another
 * member has voted or replied, the idea is theirs too, and only the team can
 * take it down.
 */
export function canWithdrawIdea(input: {
  isAuthor: boolean;
  status: IdeaStatusValue;
  merged: boolean;
  otherVotes: number;
  comments: number;
  mergedFrom: number;
}): boolean {
  return (
    input.isAuthor &&
    input.status === "OPEN" &&
    !input.merged &&
    input.otherVotes === 0 &&
    input.comments === 0 &&
    input.mergedFrom === 0
  );
}

/** The plain-language reason a vote action was refused. */
export function voteBlockMessage(block: VoteBlock): string {
  return VOTE_BLOCK_MESSAGES[block];
}

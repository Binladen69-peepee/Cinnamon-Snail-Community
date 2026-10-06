/**
 * The arithmetic of the crews recompute, kept pure so the rules that matter
 * most are tested without a database (DEC-078):
 *
 * - The job owns AUTO rows and nothing else. An OPT_IN row is the member's own
 *   choice and is never added, converted or removed by it.
 * - It only ever works on the crews it was handed (COHORT, ROADMAP and TRAIT
 *   crews that are not archived). OPTIONAL crews are never passed in, so
 *   nobody is ever auto-added to one.
 * - Running it twice changes nothing the second time: every add is a pair
 *   with no row yet, and every removal is an AUTO row whose pair is no longer
 *   wanted.
 */

export type MemberSource = "AUTO" | "OPT_IN";

export type ExistingCrewMember = {
  id: string;
  crewId: string;
  userId: string;
  source: MemberSource;
};

export type MembershipPlan = {
  add: { crewId: string; userId: string }[];
  /** Row ids of AUTO memberships to delete. */
  remove: string[];
};

/**
 * @param desired  crew id → the members its rule says belong in it. Only the
 *                 crews the job manages appear here.
 * @param existing every current row on those crews, of either source.
 */
export function planCrewMembership(
  desired: Map<string, Set<string>>,
  existing: ExistingCrewMember[],
): MembershipPlan {
  const managed = new Set(desired.keys());
  const present = new Set<string>();
  const remove: string[] = [];

  for (const row of existing) {
    if (!managed.has(row.crewId)) continue;
    present.add(`${row.crewId}\u0000${row.userId}`);
    if (row.source !== "AUTO") continue;
    if (!desired.get(row.crewId)?.has(row.userId)) remove.push(row.id);
  }

  const add: MembershipPlan["add"] = [];
  for (const [crewId, userIds] of desired) {
    for (const userId of userIds) {
      // Any row at all — AUTO already, or the member's own OPT_IN — means
      // there is nothing to add.
      if (!present.has(`${crewId}\u0000${userId}`)) add.push({ crewId, userId });
    }
  }
  return { add, remove };
}

export type ChatMemberRow = { userId: string; leftAt: Date | null };
export type CrewMemberRow = { userId: string; joinedAt: Date };

export type ChatPlan = {
  /** Crew members with no row in the chat yet. */
  add: string[];
  /** Chat members who are no longer in the crew: their membership ends. */
  leave: string[];
  /**
   * Members who left the chat because they left the crew, and have since
   * rejoined the crew: they come back in.
   */
  rejoin: string[];
};

/**
 * Keeps a crew's group chat in step with the crew.
 *
 * The one judgement call is a member who left the chat themselves while
 * staying in the crew. That choice is respected: the job never pulls them back
 * in. It tells the two cases apart by time — if they joined the crew AFTER
 * their chat membership ended, the chat ended because they had left the crew,
 * so rejoining the crew brings them back; if they left the chat after joining
 * the crew, they walked out and stay out. "Open crew chat" on the crew page is
 * how they come back on purpose.
 */
export function planChatMembership(
  crewMembers: CrewMemberRow[],
  chatMembers: ChatMemberRow[],
): ChatPlan {
  const chatByUser = new Map(chatMembers.map((row) => [row.userId, row]));
  const crewIds = new Set(crewMembers.map((row) => row.userId));

  const add: string[] = [];
  const rejoin: string[] = [];
  for (const member of crewMembers) {
    const chat = chatByUser.get(member.userId);
    if (!chat) add.push(member.userId);
    else if (chat.leftAt && member.joinedAt > chat.leftAt) rejoin.push(member.userId);
  }

  const leave = chatMembers
    .filter((row) => row.leftAt === null && !crewIds.has(row.userId))
    .map((row) => row.userId);

  return { add, leave, rejoin };
}

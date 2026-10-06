import Link from "next/link";
import { MessageSquare, Plus } from "lucide-react";
import { Badge, Card, buttonClass } from "@/components/app/ui";
import { PendingButton } from "@/components/ui/pending-button";
import { CrewIcon } from "@/components/crews/crew-icon";
import {
  joinCrewAction,
  leaveCrewAction,
  openCrewChatAction,
} from "@/app/(member)/crews/actions";
import { CREW_KIND_LABEL } from "@/lib/crews/labels";
import type { CrewCard } from "@/lib/crews/views";

/**
 * A list of crews: one card, a row per crew (DEC-078).
 *
 * The member's own crews get a way into the crew chat (and Leave, for the
 * opt-in ones); the opt-in crews they are not in get Join. The crew's name
 * always goes to its page, where the members are. Shared by Connect and
 * `/crews`, so the two can never describe a crew differently.
 */
export function CrewList({
  crews,
  variant,
  returnTo,
  showDescription = true,
}: {
  crews: CrewCard[];
  variant: "mine" | "joinable";
  returnTo: "/connect" | "/crews";
  showDescription?: boolean;
}) {
  return (
    <Card padding="none">
      <ul className="divide-y divide-separator">
        {crews.map((crew) => (
          <li
            key={crew.id}
            className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <CrewIcon kind={crew.kind} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    href={`/crews/${crew.slug}`}
                    className="text-body font-semibold text-foreground no-underline hover:underline"
                  >
                    {crew.name}
                  </Link>
                  <Badge tone={crew.kind === "OPTIONAL" ? "outline" : "neutral"}>
                    {CREW_KIND_LABEL[crew.kind]}
                  </Badge>
                </div>
                {showDescription && crew.description ? (
                  <p className="mt-0.5 text-label text-foreground-muted text-pretty">
                    {crew.description}
                  </p>
                ) : null}
                <p className="mt-1 text-caption text-foreground-muted">
                  <span className="tabular-nums">
                    {crew.memberCount} {crew.memberCount === 1 ? "member" : "members"}
                  </span>
                  {variant === "mine" && crew.reason ? <> · {crew.reason}</> : null}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 pl-13 sm:pl-0">
              {variant === "mine" ? (
                <>
                  <form action={openCrewChatAction}>
                    <input type="hidden" name="slug" value={crew.slug} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <PendingButton className={buttonClass({ size: "sm" })}>
                      <MessageSquare className="size-3.5" aria-hidden />
                      {crew.chatId ? "Open chat" : "Crew chat"}
                      <span className="sr-only"> for {crew.name}</span>
                    </PendingButton>
                  </form>
                  {/* Opt-in crews are the member's to leave; automatic ones
                      follow their rule, so they offer only the chat. */}
                  {crew.joined === "OPT_IN" ? (
                    <form action={leaveCrewAction}>
                      <input type="hidden" name="slug" value={crew.slug} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <PendingButton className={buttonClass({ variant: "ghost", size: "sm" })}>
                        Leave
                        <span className="sr-only"> {crew.name}</span>
                      </PendingButton>
                    </form>
                  ) : null}
                </>
              ) : (
                <form action={joinCrewAction}>
                  <input type="hidden" name="slug" value={crew.slug} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <PendingButton className={buttonClass({ size: "sm" })}>
                    <Plus className="size-3.5" aria-hidden />
                    Join
                    <span className="sr-only"> {crew.name}</span>
                  </PendingButton>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

export type StoryItem = {
  id: string;
  name: string;
  href: string;
  image: string | null;
  avatar: string | null;
  unseen?: boolean;
};

export function StoriesRail({
  currentUser,
  stories,
}: {
  currentUser: { name: string; avatar: string | null };
  stories: StoryItem[];
}) {
  return (
    <section aria-label="Stories" className="-mx-1 overflow-x-auto pb-1">
      <ul className="flex gap-3 px-1">
        <li className="shrink-0">
          <Link
            href="/compose?type=IMAGE"
            className="group relative block h-[180px] w-[116px] overflow-hidden rounded-[18px] bg-sage"
          >
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-3 text-center">
              <span className="vu-cta-fill grid size-12 place-items-center rounded-full transition group-hover:scale-105">
                <Plus className="size-6" aria-hidden />
              </span>
              <span className="text-xs font-semibold text-forest">Create Story</span>
            </span>
          </Link>
        </li>
        {stories.map((story) => (
          <li key={story.id} className="shrink-0">
            <Link
              href={story.href}
              className="group relative block h-[180px] w-[116px] overflow-hidden rounded-[18px] bg-mint transition duration-200 hover:scale-[1.02]"
            >
              {story.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={story.image} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-sage" />
              )}
              <span className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent" />
              <span
                className={`absolute left-2 top-2 rounded-full p-[2px] ${
                  story.unseen ? "bg-accent" : "bg-apricot"
                }`}
              >
                <span className="block rounded-full border-2 border-white">
                  <Avatar name={story.name} src={story.avatar} size="sm" />
                </span>
              </span>
              <span className="absolute inset-x-2 bottom-2 truncate text-xs font-semibold text-white">
                {story.name}
              </span>
            </Link>
          </li>
        ))}
        {stories.length === 0 ? (
          <li className="shrink-0">
            <Link
              href="/compose"
              className="relative block h-[180px] w-[116px] overflow-hidden rounded-[18px] bg-mint p-3"
            >
              <Avatar name={currentUser.name} src={currentUser.avatar} size="sm" />
              <p className="absolute inset-x-2 bottom-3 text-xs font-semibold text-forest">
                Your Story
              </p>
            </Link>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

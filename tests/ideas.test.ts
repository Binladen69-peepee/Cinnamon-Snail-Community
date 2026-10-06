import { describe, expect, it } from "vitest";
import {
  IDEA_CATEGORY_VALUES,
  IDEA_STATUS_VALUES,
  adminIdeasHref,
  ideasHref,
  parseAdminIdeaFilter,
  parseIdeaCategory,
  parseIdeaSort,
  parseIdeaStatusFilter,
  parsePage,
  statusesForFilter,
} from "@/lib/ideas/constants";
import {
  AUTHOR_VOTE_COUNTS,
  canEditIdea,
  canWithdrawIdea,
  ideaVoteBlock,
} from "@/lib/ideas/rules";
import {
  SIMILAR_THRESHOLD,
  diceOverlap,
  ideaTitleKey,
  ideaTokens,
  normalizeIdeaTitle,
  rankSimilar,
  stemToken,
  titleSimilarity,
  trigramQuery,
} from "@/lib/ideas/similarity";
import { IDEA_LIMITS, ideaLimitKey } from "@/lib/ideas/limits";
import { statusNotice } from "@/lib/ideas/notify";

/**
 * Ideas & Requests (DEC-078): the rules that need no database.
 *
 * Who may vote, edit and withdraw; how the board's views read from and write
 * to the URL; how "has someone asked for this already?" decides; and what a
 * status change says, to whom.
 */

describe("the board's views live in the URL", () => {
  it("reads sort, kind, status and page defensively", () => {
    expect(parseIdeaSort(undefined)).toBe("top");
    expect(parseIdeaSort("new")).toBe("new");
    expect(parseIdeaSort("planned")).toBe("planned");
    expect(parseIdeaSort("hot")).toBe("top");
    expect(parseIdeaCategory("recipe")).toBe("RECIPE");
    expect(parseIdeaCategory("RECIPE")).toBe("RECIPE");
    expect(parseIdeaCategory("snacks")).toBeNull();
    expect(parseIdeaStatusFilter(undefined)).toBe("active");
    expect(parseIdeaStatusFilter("under-review")).toBe("UNDER_REVIEW");
    expect(parseIdeaStatusFilter("all")).toBe("all");
    expect(parseIdeaStatusFilter("<script>")).toBe("active");
    expect(parsePage("3")).toBe(3);
    expect(parsePage("-4")).toBe(1);
    expect(parsePage("nope")).toBe(1);
    expect(parsePage("99999")).toBe(500);
  });

  it("writes the shortest address for a view and reads it back", () => {
    expect(ideasHref({})).toBe("/ideas");
    expect(ideasHref({ sort: "top", status: "active", page: 1 })).toBe("/ideas");
    const href = ideasHref({ sort: "new", category: "FEATURE", status: "DONE", page: 2 });
    const params = new URL(href, "https://example.test").searchParams;
    expect(parseIdeaSort(params.get("sort") ?? undefined)).toBe("new");
    expect(parseIdeaCategory(params.get("category") ?? undefined)).toBe("FEATURE");
    expect(parseIdeaStatusFilter(params.get("status") ?? undefined)).toBe("DONE");
    expect(parsePage(params.get("page") ?? undefined)).toBe(2);
  });

  it("shows what is still in play by default, and everything on request", () => {
    expect(statusesForFilter("active")).toEqual(["OPEN", "UNDER_REVIEW", "PLANNED"]);
    expect(statusesForFilter("DECLINED")).toEqual(["DECLINED"]);
    expect(statusesForFilter("all")).toBeNull();
  });

  it("has a console filter for every status, plus merged and removed", () => {
    expect(parseAdminIdeaFilter("merged")).toBe("merged");
    expect(parseAdminIdeaFilter("bogus")).toBe("open");
    expect(adminIdeasHref({ filter: "open", sort: "votes" })).toBe("/admin/ideas");
    expect(adminIdeasHref({ filter: "removed", sort: "new", page: 2 })).toBe(
      "/admin/ideas?filter=removed&sort=new&page=2",
    );
  });

  it("keeps the database's enums and the client's lists the same", () => {
    expect([...IDEA_CATEGORY_VALUES]).toEqual(["CLASS", "RECIPE", "FEATURE", "OTHER"]);
    expect([...IDEA_STATUS_VALUES]).toEqual(["OPEN", "UNDER_REVIEW", "PLANNED", "DONE", "DECLINED"]);
  });
});

describe("who may vote", () => {
  it("counts the author's own vote and does not let them press it", () => {
    expect(AUTHOR_VOTE_COUNTS).toBe(true);
    expect(ideaVoteBlock({ isAuthor: true, status: "OPEN", merged: false })).toBe("own");
    expect(ideaVoteBlock({ isAuthor: false, status: "OPEN", merged: false })).toBeNull();
  });

  it("keeps voting open while an idea is under review or planned", () => {
    for (const status of ["OPEN", "UNDER_REVIEW", "PLANNED"] as const) {
      expect(ideaVoteBlock({ isAuthor: false, status, merged: false })).toBeNull();
    }
  });

  it("closes voting on shipped, declined and merged ideas", () => {
    expect(ideaVoteBlock({ isAuthor: false, status: "DONE", merged: false })).toBe("closed");
    expect(ideaVoteBlock({ isAuthor: false, status: "DECLINED", merged: false })).toBe("closed");
    // Merged wins: the useful answer is "vote over there".
    expect(ideaVoteBlock({ isAuthor: true, status: "DONE", merged: true })).toBe("merged");
  });
});

describe("who may change an idea", () => {
  it("lets the author edit only while it is open, and staff always", () => {
    expect(canEditIdea({ isAuthor: true, isStaff: false, status: "OPEN", merged: false })).toBe(true);
    expect(canEditIdea({ isAuthor: true, isStaff: false, status: "PLANNED", merged: false })).toBe(false);
    expect(canEditIdea({ isAuthor: true, isStaff: false, status: "OPEN", merged: true })).toBe(false);
    expect(canEditIdea({ isAuthor: false, isStaff: false, status: "OPEN", merged: false })).toBe(false);
    expect(canEditIdea({ isAuthor: false, isStaff: true, status: "DONE", merged: false })).toBe(true);
  });

  it("lets the author withdraw only an idea nobody else has joined", () => {
    const base = {
      isAuthor: true,
      status: "OPEN" as const,
      merged: false,
      otherVotes: 0,
      comments: 0,
      mergedFrom: 0,
    };
    expect(canWithdrawIdea(base)).toBe(true);
    expect(canWithdrawIdea({ ...base, otherVotes: 1 })).toBe(false);
    expect(canWithdrawIdea({ ...base, comments: 1 })).toBe(false);
    expect(canWithdrawIdea({ ...base, mergedFrom: 1 })).toBe(false);
    expect(canWithdrawIdea({ ...base, status: "UNDER_REVIEW" })).toBe(false);
    expect(canWithdrawIdea({ ...base, isAuthor: false })).toBe(false);
  });
});

describe("has someone asked for this already?", () => {
  it("drops the words every request shares and folds plurals", () => {
    expect(ideaTokens("A vegan class on croissants, please!")).toEqual(["croissant"]);
    expect(ideaTokens("Weeknight ramen recipes")).toEqual(["weeknight", "ramen"]);
    expect(ideaTokens("Crème brûlée")).toEqual(["creme", "brulee"]);
    expect(trigramQuery("How to make the best vegan croissants")).toBe("croissant");
  });

  it("brings singular and plural to one stem", () => {
    for (const [a, b] of [
      ["berries", "berry"],
      ["cookies", "cookie"],
      ["tomatoes", "tomato"],
      ["sandwiches", "sandwich"],
      ["lentils", "lentil"],
      ["curries", "curry"],
    ]) {
      expect(stemToken(a!), `${a} / ${b}`).toBe(stemToken(b!));
    }
    // Words that end in s without being plural keep it.
    expect(stemToken("hummus")).toBe("hummus");
    expect(stemToken("couscous")).toBe("couscous");
  });

  it("scores shared topic words with the Dice coefficient", () => {
    expect(diceOverlap(["croissant"], ["croissant"])).toBe(1);
    expect(diceOverlap(["tempeh", "bacon"], ["tempeh"])).toBeCloseTo(2 / 3);
    expect(diceOverlap(["soup"], ["bread"])).toBe(0);
    expect(diceOverlap([], ["bread"])).toBe(0);
  });

  it("matches the same request worded differently", () => {
    expect(titleSimilarity("Croissant class", "Vegan croissants please")).toBe(1);
    expect(
      titleSimilarity("Gluten-free sourdough", "Sourdough that is gluten free"),
    ).toBeGreaterThanOrEqual(SIMILAR_THRESHOLD);
  });

  it("does not match two requests that only share the board's words", () => {
    // Both are "a vegan class on …", which says nothing about what is asked.
    expect(titleSimilarity("A vegan class on soups", "A vegan class on breads")).toBeLessThan(
      SIMILAR_THRESHOLD,
    );
    expect(titleSimilarity("Dark mode for the app", "Search filters in the app")).toBeLessThan(
      SIMILAR_THRESHOLD,
    );
  });

  it("lets a strong trigram score through for typos", () => {
    // "chesecake" shares no exact word with "cheesecake"; Postgres catches it.
    expect(titleSimilarity("Chesecake", "Baked cheesecake", 0.6)).toBe(0.6);
    expect(titleSimilarity("Chesecake", "Baked cheesecake", 0.1)).toBeLessThan(SIMILAR_THRESHOLD);
  });

  it("ranks close matches first and drops the rest", () => {
    const ranked = rankSimilar(
      "Croissant class",
      [
        { id: "a", title: "Bread baking basics", trigram: 0.05 },
        { id: "b", title: "Croissants at home", trigram: 0.3 },
        { id: "c", title: "Laminated dough and croissants", trigram: 0.2 },
      ],
      5,
    );
    expect(ranked.map((row) => row.id)).toEqual(["b", "c"]);
    expect(ranked[0]!.similarity).toBeCloseTo(2 / 3);
    expect(ranked[1]!.similarity).toBeCloseTo(1 / 2);
  });

  it("treats case, spacing and punctuation as the same title", () => {
    expect(ideaTitleKey("Vegan Croissants!")).toBe(ideaTitleKey("vegan   croissants"));
    expect(ideaTitleKey("Ramen")).not.toBe(ideaTitleKey("Ramen bowls"));
    expect(normalizeIdeaTitle("  Weeknight\n ramen  ")).toBe("Weeknight ramen");
  });
});

describe("what a status change says", () => {
  it("tells voters only when an idea is planned or done", () => {
    expect(statusNotice("PLANNED", "Croissants", null).voters).not.toBeNull();
    expect(statusNotice("DONE", "Croissants", null).voters).not.toBeNull();
    expect(statusNotice("UNDER_REVIEW", "Croissants", null).voters).toBeNull();
    expect(statusNotice("DECLINED", "Croissants", null).voters).toBeNull();
    expect(statusNotice("OPEN", "Croissants", null).voters).toBeNull();
  });

  it("carries the team's note and names the idea", () => {
    const notice = statusNotice("PLANNED", "Croissants at home", "Filming in November.");
    expect(notice.author.title).toBe("Your idea is planned");
    expect(notice.author.body).toContain("Croissants at home");
    expect(notice.author.body).toContain("Filming in November.");
  });

  it("never puts markdown asterisks in a notification", () => {
    for (const status of IDEA_STATUS_VALUES) {
      const notice = statusNotice(status, "Plain title", null);
      expect(notice.author.body).not.toContain("**");
    }
  });
});

describe("rate limits", () => {
  it("keeps the board's allowances in their own buckets", () => {
    expect(ideaLimitKey("vote", "u1")).toBe("ideas:vote:u1");
    expect(ideaLimitKey("submit", "u1")).toBe("ideas:submit:u1");
  });

  it("allows far more than a person does by hand, and far less than a script", () => {
    expect(IDEA_LIMITS.submit.limit).toBeGreaterThanOrEqual(5);
    expect(IDEA_LIMITS.submit.limit).toBeLessThanOrEqual(20);
    expect(IDEA_LIMITS.vote.limit).toBeGreaterThanOrEqual(60);
    expect(IDEA_LIMITS.vote.limit).toBeLessThanOrEqual(300);
  });
});

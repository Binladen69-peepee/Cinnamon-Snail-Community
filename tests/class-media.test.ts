import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv, splitCsvLine, toCsv } from "@/lib/csv";
import {
  matchClassMedia,
  normalizeClassName,
  parseClassAliases,
  parseClassMediaCsv,
  teaserForStorage,
} from "@/lib/marketing/class-media";
import { youTubeEmbed, youTubeId } from "@/lib/marketing/teasers";

describe("CSV reading", () => {
  it("keeps commas inside quoted cells", () => {
    expect(splitCsvLine('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
  });

  it("unescapes doubled quotes", () => {
    expect(splitCsvLine('"say ""hi""",x')).toEqual(['say "hi"', "x"]);
  });

  it("strips a UTF-8 BOM from an Excel export", () => {
    const rows = parseCsv("﻿name,url\nSoup,https://x/y.jpg\n");
    expect(rows[0].name).toBe("Soup");
  });

  it("keeps a quoted newline inside one record", () => {
    const rows = parseCsv('name,note\n"Two\nLines",ok\n');
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Two\nLines");
  });

  it("round-trips cells that need quoting", () => {
    const text = toCsv(["a", "b"], [['x,y', 'he said "no"']]);
    expect(parseCsv(text)[0]).toEqual({ a: "x,y", b: 'he said "no"' });
  });
});

describe("YouTube teaser links", () => {
  it("reads an id from every shape the sheet might use", () => {
    const id = "GuhyvG7W48c";
    expect(youTubeId(`https://www.youtube.com/embed/${id}`)).toBe(id);
    expect(youTubeId(`https://www.youtube.com/watch?v=${id}`)).toBe(id);
    expect(youTubeId(`https://youtu.be/${id}`)).toBe(id);
    expect(youTubeId(`https://www.youtube.com/shorts/${id}`)).toBe(id);
  });

  it("rejects non-YouTube and malformed links", () => {
    expect(youTubeId("https://vimeo.com/12345")).toBeNull();
    expect(youTubeId("https://www.youtube.com/watch?v=tooshort")).toBeNull();
    expect(youTubeId("not a url")).toBeNull();
    expect(youTubeId(null)).toBeNull();
  });

  it("canonicalises to a nocookie embed", () => {
    expect(youTubeEmbed("https://youtu.be/GuhyvG7W48c")).toBe(
      "https://www.youtube-nocookie.com/embed/GuhyvG7W48c",
    );
  });

  it("leaves a self-hosted file alone so <video> can play it", () => {
    const mp4 = "https://cdn.example.com/teaser.mp4";
    expect(youTubeEmbed(mp4)).toBeNull();
    expect(teaserForStorage({ className: "x", thumbnailUrl: null, teaserUrl: mp4 })).toBe(mp4);
  });
});

describe("class name normalisation", () => {
  it("ignores case, punctuation and spacing", () => {
    expect(normalizeClassName("Vegan Mother's Day Cook-Along Brunch")).toBe(
      normalizeClassName("vegan mothers day cook along brunch"),
    );
  });

  it("treats a curly apostrophe as a straight one", () => {
    expect(normalizeClassName("Bangin’ Tex-Mex")).toBe(
      normalizeClassName("Bangin' Tex-Mex"),
    );
  });

  it("spells out an ampersand", () => {
    expect(normalizeClassName("Root Veggies & Rituals")).toBe(
      normalizeClassName("Root Veggies and Rituals"),
    );
  });
});

describe("matching the sheet to the catalog", () => {
  const courses = [
    { slug: "seitan-masterclass", title: "Seitan Masterclass" },
    { slug: "vegan-soup-workshop", title: "Vegan Soup Workshop" },
    { slug: "vegan-turkish-cuisine", title: "Vegan Turkish Cuisine" },
  ];

  const row = (className: string) => ({
    className,
    thumbnailUrl: "https://cinnamonsnail.com/a.jpg",
    teaserUrl: "https://www.youtube.com/embed/GuhyvG7W48c",
  });

  it("matches despite punctuation and case drift", () => {
    const report = matchClassMedia([row("seitan  MASTERCLASS")], courses);
    expect(report.matched).toHaveLength(1);
    expect(report.matched[0].course.slug).toBe("seitan-masterclass");
  });

  it("reports classes the sheet says nothing about", () => {
    const report = matchClassMedia([row("Seitan Masterclass")], courses);
    expect(report.missingCourses.map((c) => c.slug)).toEqual([
      "vegan-soup-workshop",
      "vegan-turkish-cuisine",
    ]);
  });

  it("never applies a merely-similar name, only suggests it", () => {
    const report = matchClassMedia([row("Vegan Turkish Cuisines Deluxe")], courses);
    expect(report.matched).toHaveLength(0);
    expect(report.unmatchedRows).toHaveLength(1);
    expect(report.unmatchedRows[0].course.slug).toBe("vegan-turkish-cuisine");
    // And the class itself is still reported as needing media.
    expect(report.missingCourses.map((c) => c.slug)).toContain(
      "vegan-turkish-cuisine",
    );
  });

  it("uses a sheet row only once", () => {
    const report = matchClassMedia(
      [row("Seitan Masterclass"), row("seitan masterclass")],
      courses,
    );
    expect(report.matched).toHaveLength(1);
    expect(report.duplicateRows).toHaveLength(1);
  });

  it("does not claim a course for a row with no media at all", () => {
    const report = parseClassMediaCsv("class_name,thumbnail_url,teaser_url\nSeitan Masterclass,,\n");
    expect(report[0].thumbnailUrl).toBeNull();
    expect(report[0].teaserUrl).toBeNull();
  });
});

describe("manual aliases", () => {
  const courses = [
    { slug: "the-best-falafel-and-vegan-mezze", title: "The Best Falafel and Vegan Mezze" },
    { slug: "vegan-soup-workshop", title: "Vegan Soup Workshop" },
  ];
  const row = (className: string) => ({
    className,
    thumbnailUrl: "https://cinnamonsnail.com/a.jpg",
    teaserUrl: null,
  });

  it("pairs a spelling the matcher refuses on its own", () => {
    const aliases = parseClassAliases(
      [
        "sheet_class_name,course_slug",
        "The best falafel and vegan meze,the-best-falafel-and-vegan-mezze",
      ].join("\n"),
    );
    const report = matchClassMedia([row("The best falafel and vegan meze")], courses, aliases);
    expect(report.matched).toHaveLength(1);
    expect(report.matched[0].course.slug).toBe("the-best-falafel-and-vegan-mezze");
    expect(report.unmatchedRows).toHaveLength(0);
  });

  it("is still unmatched without the alias", () => {
    const report = matchClassMedia([row("The best falafel and vegan meze")], courses);
    expect(report.matched).toHaveLength(0);
  });

  it("ignores an alias pointing at a slug that does not exist", () => {
    const aliases = parseClassAliases(
      [
        "sheet_class_name,course_slug",
        "The best falafel and vegan meze,no-such-course",
      ].join("\n"),
    );
    const report = matchClassMedia([row("The best falafel and vegan meze")], courses, aliases);
    expect(report.matched).toHaveLength(0);
  });

  it("reads the committed alias file", () => {
    const aliases = parseClassAliases(
      readFileSync(resolve(process.cwd(), "data/class-media-aliases.csv"), "utf8"),
    );
    expect(aliases.get(normalizeClassName("The best falafel and vegan meze"))).toBe(
      "the-best-falafel-and-vegan-mezze",
    );
  });
});

describe("the committed client sheet", () => {
  const text = readFileSync(
    resolve(process.cwd(), "data/class-media.csv"),
    "utf8",
  );
  const rows = parseClassMediaCsv(text);

  it("parses every row with a usable photo and teaser", () => {
    expect(rows.length).toBe(51);
    expect(rows.every((r) => r.thumbnailUrl !== null)).toBe(true);
    expect(rows.every((r) => r.teaserUrl !== null)).toBe(true);
  });

  it("only references the client's own media library", () => {
    expect(
      rows.every((r) => r.thumbnailUrl!.startsWith("https://cinnamonsnail.com/")),
    ).toBe(true);
  });

  it("resolves every teaser to a canonical embed", () => {
    for (const row of rows) {
      expect(teaserForStorage(row)).toMatch(
        /^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}$/,
      );
    }
  });

  it("has no duplicate class names", () => {
    const keys = rows.map((r) => normalizeClassName(r.className));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

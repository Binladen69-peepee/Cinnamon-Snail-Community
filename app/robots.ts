import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/home",
        "/kitchen-table",
        "/ideas",
        "/live-classes",
        "/crews",
        "/challenges",
        "/drafts",
        "/spaces",
        "/posts",
        "/compose",
        "/members",
        "/connect",
        "/learn",
        "/roadmap",
        "/calendar",
        "/bulletin",
        "/messages",
        "/search",
        "/notifications",
        "/settings",
        "/admin",
        "/login",
      ],
    },
  };
}

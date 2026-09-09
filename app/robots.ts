import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/home",
        "/spaces",
        "/posts",
        "/compose",
        "/members",
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

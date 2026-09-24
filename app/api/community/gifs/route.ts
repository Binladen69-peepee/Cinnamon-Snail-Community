import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * GIF search, through Tenor.
 *
 * The key is held on the server and never reaches the browser, so the GIF
 * picker asks this route rather than Tenor directly. Without a key the route
 * answers honestly — `configured: false` — and the picker hides itself rather
 * than showing a search box that can never return anything.
 *
 * A GIF chosen here becomes a plain image attachment by URL. It is not
 * uploaded into our own storage: it is a public URL on a CDN built for exactly
 * this, and copying it would cost storage and bandwidth for no benefit.
 */
const TENOR = "https://tenor.googleapis.com/v2/search";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ error: "You need to sign in." }, { status: 401 });
  }

  const key = process.env.TENOR_API_KEY;
  if (!key) {
    return NextResponse.json({ configured: false, gifs: [] });
  }

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query) return NextResponse.json({ configured: true, gifs: [] });

  try {
    const params = new URLSearchParams({
      key,
      q: query,
      limit: "12",
      media_filter: "tinygif,gif",
      contentfilter: "high",
      client_key: "vegan-university",
    });
    const response = await fetch(`${TENOR}?${params}`, {
      // Searches repeat constantly and the results barely move.
      next: { revalidate: 3600 },
    });
    if (!response.ok) throw new Error(String(response.status));
    const data = (await response.json()) as {
      results?: {
        id: string;
        content_description?: string;
        media_formats?: Record<string, { url?: string; dims?: number[] }>;
      }[];
    };

    const gifs = (data.results ?? [])
      .map((result) => {
        const full = result.media_formats?.gif;
        const preview = result.media_formats?.tinygif ?? full;
        if (!full?.url || !preview?.url) return null;
        return {
          id: result.id,
          url: full.url,
          previewUrl: preview.url,
          alt: result.content_description || query,
          width: full.dims?.[0] ?? null,
          height: full.dims?.[1] ?? null,
        };
      })
      .filter((gif): gif is NonNullable<typeof gif> => gif !== null);

    return NextResponse.json({ configured: true, gifs });
  } catch {
    // A third party being down is not an error the member can act on.
    return NextResponse.json({ configured: true, gifs: [] });
  }
}

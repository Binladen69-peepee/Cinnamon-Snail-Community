import { videoEmbedSrc } from "@/lib/community/media";

export function VideoEmbed({ url }: { url: string }) {
  const src = videoEmbedSrc(url);
  if (!src) {
    return (
      <a href={url} className="mt-2 inline-block text-sm text-olive" target="_blank" rel="noreferrer">
        {url}
      </a>
    );
  }
  return (
    <div className="mt-4 aspect-video overflow-hidden rounded-2xl bg-forest/10 dark:bg-paper/10">
      <iframe
        src={src}
        title="Embedded video"
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

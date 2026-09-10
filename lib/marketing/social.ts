/**
 * Cinnamon Snail's public profiles.
 *
 * These are real, published accounts — the footer previously said social
 * handles were not published and refused to link empty profiles, which no
 * longer applies.
 */
export type SocialLink = {
  /** Platform name, used for the accessible label. */
  name: string;
  href: string;
  /** Which glyph to render; see components/marketing/social-icons.tsx. */
  icon: "instagram" | "pinterest" | "facebook" | "youtube" | "website";
  /** Spoken by screen readers in place of the glyph. */
  label: string;
};

export const SOCIAL_LINKS: SocialLink[] = [
  {
    name: "Instagram",
    href: "https://www.instagram.com/cinnamonsnail/",
    icon: "instagram",
    label: "Cinnamon Snail on Instagram",
  },
  {
    name: "Pinterest",
    href: "https://www.pinterest.com/cinnamonsnail/",
    icon: "pinterest",
    label: "Cinnamon Snail on Pinterest",
  },
  {
    name: "Facebook",
    href: "https://www.facebook.com/TheCinnamonSnail/",
    icon: "facebook",
    label: "Cinnamon Snail on Facebook",
  },
  {
    name: "YouTube",
    href: "https://www.youtube.com/@CinnamonSnail",
    icon: "youtube",
    label: "Cinnamon Snail on YouTube",
  },
  {
    name: "Website",
    href: "https://cinnamonsnail.com/",
    icon: "website",
    label: "cinnamonsnail.com",
  },
];

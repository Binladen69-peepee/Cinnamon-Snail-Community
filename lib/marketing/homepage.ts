export const HOMEPAGE_FAQS = [
  {
    question: "Do I need to already know how to cook vegan?",
    answer:
      "No. Vegan University is a cooking school for people who want plant meals to feel ordinary and good — including the first week you try tofu that isn't a brick. Lessons are meant to lead to dinner, not an intimidating LMS.",
  },
  {
    question: "What is Kitchen Table, and how does community access work?",
    answer:
      "Kitchen Table is our hosted community space — plates, sauce questions, and celebrations with names attached, not a nameless feed. You can peek at the idea from the public site. Posting, comments, and member profiles open after you sign in with an active membership entitlement.",
  },
  {
    question: "How does membership billing work?",
    answer:
      "Checkout happens on SamCart. SamCart is the source of truth for money; this app is the source of truth for access. We grant and revoke access from verified webhooks and entitlements — never by guessing in the browser.",
  },
  {
    question: "Can I cancel? What happens to my access?",
    answer:
      "Yes, and the cancel path is in the open — no dark patterns. Cancel from Membership after you sign in. We never claim cancellation succeeded until SamCart confirms it. Access then follows the period SamCart reports: if a period end is still in the future, you keep access until then.",
  },
  {
    question: "What is the refund policy?",
    answer:
      "Refunds are processed through SamCart, not as a fake in-app chargeback. When SamCart confirms a refund, this app updates access to match. We do not invent a separate refund window on this page.",
  },
  {
    question: "How do I sign in after I join?",
    answer:
      "We email a one-time magic link. You can add a password later in settings. Community, courses, and billing tools live behind that sign-in — not on a public dashboard.",
  },
] as const;

export const REPRESENTATIVE_COURSES = [
  {
    slug: "weeknight-plants",
    title: "Weeknight plants",
    level: "Beginner",
    description:
      "Dinner in under 40 minutes from a normal grocery run — no specialty-store scavenger hunt.",
    image:
      "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80",
    alt: "Chopped vegetables and greens on a board",
  },
  {
    slug: "sauces-that-carry",
    title: "Sauces that carry the plate",
    level: "Intermediate",
    description:
      "Cashew creams, chili oils, and herb pastes so a bowl of grains actually tastes like a meal.",
    image:
      "https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=900&q=80",
    alt: "A herb and oil sauce being spooned",
  },
  {
    slug: "baking-without-the-usual",
    title: "Baking without eggs or dairy",
    level: "Beginner",
    description:
      "Cakes, breads, and cookies that set and brown because the method is right — not because we hid a dairy swap.",
    image:
      "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80",
    alt: "Freshly baked bread on a board",
  },
  {
    slug: "ferments-and-fridge-heroes",
    title: "Ferments and fridge heroes",
    level: "Intermediate",
    description:
      "Pickles, slaws, and the jar that makes Tuesday tofu taste like you planned it.",
    image:
      "https://images.unsplash.com/photo-1466637574441-749b8f19452f?auto=format&fit=crop&w=900&q=80",
    alt: "Hands adding herbs to a pan",
  },
] as const;

export const MEMBER_STORIES = [
  {
    quote: "I went from confused vegan to confident cook — not because of a content dump, because I posted the plate and someone told me to salt the tofu first.",
    name: "Priya",
    detail: "Weeknight cook, joined to stop ordering the same three takeout bowls",
    image:
      "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=800&q=80",
    alt: "A person cooking vegetables at a stove",
  },
  {
    quote: "Kitchen Table is the first cooking community that asked what I made tonight instead of how many lessons I completed.",
    name: "Marcus",
    detail: "New to plants after a doctor's nudge, still burns garlic sometimes",
    image:
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80",
    alt: "A finished plant-based meal on a table",
  },
  {
    quote: "I don't need another dashboard. I need a class that ends in dinner, and people who care if the radicchio was bitter.",
    name: "Elena",
    detail: "Home baker learning savory, posts more questions than photos",
    image:
      "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=800&q=80",
    alt: "Fresh produce including greens and vegetables",
  },
] as const;

export const PILLARS = [
  {
    title: "Learn",
    body: "Short lessons that end in a plate. You always know what to cook next, how long it takes, and which sauce the class is arguing about.",
    image:
      "https://images.unsplash.com/photo-1507048331197-7d4ac70811cf?auto=format&fit=crop&w=900&q=80",
    alt: "Hands chopping vegetables on a wooden board",
  },
  {
    title: "Cook",
    body: "Make the thing the same night. Post the bowl. Ask why the tempeh stayed pale. Cooking here is the homework, not a side quest.",
    image:
      "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=900&q=80",
    alt: "A vibrant bowl of roasted vegetables, greens, and citrus",
  },
  {
    title: "Belong",
    body: "People have names, cities, and favorite pans. You are not a username in a content library — you have a seat at Kitchen Table.",
    image:
      "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=900&q=80",
    alt: "A shared table of plated food",
  },
] as const;

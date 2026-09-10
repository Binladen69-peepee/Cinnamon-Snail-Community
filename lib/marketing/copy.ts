/**
 * Final client copy for the homepage and /membership.
 *
 * This is signed-off copy from the client brief, pasted verbatim. Do not
 * paraphrase or "improve" it — if wording needs to change, that is a client
 * decision, not an implementation one.
 */

export const HOMEPAGE_HERO = {
  headline:
    "The vegan cooking school that helps you turn your skeptical non-veg friends and family into second-helping regulars.",
  subhead:
    "Live cook-alongs, recipes people actually adore, and a chef in your corner to help you master plant cooking.",
} as const;

export const PILLAR_CARDS = [
  {
    title: "Learn",
    slotId: "home-learn",
    body: "Short, live classes that end with a plate in front of you, not a long, boring syllabus. You'll know exactly what you should cook next, how long it takes, and how to customize things according to your diet and taste.",
  },
  {
    title: "Cook",
    slotId: "home-cook",
    body: "Make the thing the same night you learn it. Post the bowl. Find out why your seitan came out rubbery from someone who's already been there and cooked thousands of lbs. of it a week. Cooking with care for people you love is the homework, not extra credit you skip.",
  },
  {
    title: "Belong",
    slotId: "home-belong",
    body: "Real names, real kitchens, real vegan home cooks from all around the world rooting for you. You're not a username trapped in a content library, you've got a seat at our Kitchen Table where you share absurdly yummy vegan food with the world.",
  },
] as const;

export const KITCHEN_TABLE_BLOCK = {
  paragraphs: [
    "Other platforms dump you off in a facebook group and call it a day. Kitchen Table is ours, built for kind, caring people who actually cooked something. This cooking crew doesn’t just high-5 folks who have been vegan for decades. We nourish and encourage cooks at any stage of their progression towards having jaw-dropping plant-based superpowers.",
    "You follow a class, make dinner, post the plate, and find someone else wrestling with the same issues at the same time. We grow and learn together as group of friends. No algorithm decides who gets seen. Hosts keep it useful, not chaotic.",
  ],
} as const;

export const MEMBERSHIP_TEASER = {
  body: "You don't need five hundred more recipes sitting in a bookmarked tab you'll never open again. You need a live class, a plate in front of you, and people who'll tell you the honest truth about your seitan (without roasting you to death), plus the exact battle-tested menu to make when your meat-eating in-laws come over and you want them to go home with changed minds about veganism.",
} as const;

export const HOMEPAGE_FAQS = [
  {
    question: "Do I need to already know how to cook vegan?",
    answer: [
      "Nope. That’s kinda the whole point, right?",
      "What’s really special about Vegan University is that it’s not a one-size fits all approach to learning. Each member gets a tailored learning roadmap based on where they are at as a cook. And students decide the pacing to fit their life without pressure and stress. It’s truly a revolutionary approach to learning.",
    ],
  },
  {
    question: "What is Kitchen Table, and how does community access work?",
    answer: [
      "This is the actual community side of Vegan University: real (genuinely nice) people who you can connect with, learn from, and invite over for potlucks if you want.",
      "You're in the second you join. Post what you made, ask why your attempt at homemade tofu turned to gross cottage cheese-looking nightmare mush, or lurk for a while and get turned on to some really fun cooking ideas.",
    ],
  },
  {
    question: "How does membership billing work?",
    answer: [
      "You pick monthly or yearly when you join, and you're billed automatically until you cancel. Canceling takes about 60 seconds, no calls, no chasing down a hidden button, no guilt trip on your way out.",
    ],
  },
  {
    question: "Can I cancel any time?",
    answer: [
      "Whenever you want, right from your account. You'll keep access through whatever period you already paid for, then it just stops. No hard feelings, though we might just miss you with all our hearts.",
    ],
  },
] as const;

export const MEMBERSHIP_PAGE = {
  headline:
    "The cooking school that actively helps you rock the best dinners ever, not a library of endless content you never have time to deal with.",
  subhead:
    "Cook well enough that the skeptics at your table stop asking where the meat went and start asking for the recipe.",
  // True, specific credentials — no invented claims.
  credibility: [
    "James Beard House",
    "New York Times",
    "Food Network",
    "Vendy Award winner",
    "1000+ recipe testers",
  ],
  opening: [
    "I went vegan in 2001, on the day my daughter was born. Knowing how important nursing would be for our child, I knew I couldn’t continue to stand in the way of that sacred bond for any other living being.",
    "In 2010 I started cooking vegan food out of a truck in Manhattan, mostly to prove to skeptics and lifelong meat eaters that they wouldn't miss a thing. Since then I've cooked at the James Beard House, gotten written up in the New York Times, and won a Vendy Award for best food truck in New York City. Not best vegan food truck. Best food truck -period.",
    "Vegan University is me handing you everything I learned doing that, live, so the people in your life get converted by your cooking instead of your arguments.",
  ],
  problem: {
    title: "The problem",
    paragraphs: [
      "Maybe you've got a folder of recipes you saved and never made. Maybe your family still side-eyes the tofu. Maybe you've stood in your kitchen at 6pm, completely out of ideas, one search away from ordering takeout again. None of that means you're bad at this.",
      "It usually just means somebody handed you a recipe and wished you luck, instead of actually teaching you how to cook.",
    ],
  },
  turn: {
    title: "The turn",
    paragraphs: [
      "This is the whole point of Vegan University. The goal isn't just to be a better home cook (though that’s a fun side effect). It's to learn to cook in a way that the people you're trying to win over stop noticing there's no meat on the plate. This is a special skill, and requires becoming more receptive to where people are at so you understand the specific meals and recipes you can share with them that will 200% blow their minds.",
      "What you pick up in Vegan University is not another pile of recipes gathering dust.",
      "Instead, you learn a very effective cooking system through live classes, an on demand course library, a custom learning roadmap, real feedback, and a place to ask why your custard didn’t set up correctly before you throw the pan across the kitchen with smoke billowing out from your ears.",
    ],
  },
  inside: [
    {
      title: "Live Cook-Alongs",
      body: "Cook right alongside me, live. Ask your question mid-sauté instead of guessing and hoping for the best. Watch the dish come together in real time, then make it yourself, in your own kitchen, that same night.",
    },
    {
      title: "Full Class Library",
      body: "Every class I've ever taught, plus new ones added monthly, all in one place. Weeknight dinners. Holiday spreads. Baking without eggs or dairy. Sauces and ferments for when you're ready to level up. Search it, skip around, start wherever you actually are.",
    },
    {
      title: "Kitchen Table Community",
      body: "A real group of home cooks in it with you, not a comment section. Post your plate. Ask the question you think is dumb. Somebody in there has already ruined that exact recipe and will tell you exactly what went wrong.",
    },
    {
      title: "Recipes Tested, Not Guessed",
      body: "Every recipe gets cooked by a crew of 1000+ recipe testers of every skill level in regular home kitchens before it ever reaches you. If it's in the library, it works with a normal stove and a normal grocery budget, and it holds up with the non-veg skeptics at your table too.",
    },
    {
      title: "Done-For-You Menus for the People You're Trying to Win Over",
      body: "Thanksgiving. Passover. Valentine's Day. The night your in-laws finally come over. Full menus, shopping lists, and a timeline so the whole spread lands on the table at the same time, hot, and good enough that nobody asks where the meat is.",
    },
  ],
  close: {
    title: "The close",
    paragraphs: [
      "Joining takes about a minute. Canceling takes about thirty seconds, whenever you want, right from your account. No phone call, no \"are you sure\" guilt trip, no vanishing button. We'd rather earn your membership every single month than trap you into one.",
    ],
    afterCta:
      "Vegan University was never really about proving I could cook without animal products. It's about the people you personally convert because you cooked them something vegan that made it finally click for them. Every friend or family member who eats a plant-based dinner instead of the version with meat in it because you made it for them, that's the actual win here. I just get to be the one hooking you up with recipe tips at you while you do it.",
  },
} as const;

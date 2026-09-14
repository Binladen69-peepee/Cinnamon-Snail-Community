import type { PrismaClient } from "@prisma/client";

/**
 * Seeds the real, current class catalog from the client brief.
 *
 * This is seed data, not the source of truth: the homepage reads categories and
 * classes out of the Course table at request time, so new live cook-alongs
 * added later show up without a code change. Categories mirror what is publicly
 * visible on cinnamonsnail.com; if Adam's Mighty Networks course portal uses a
 * different folder structure, re-run this with those names and the rows
 * re-group themselves.
 *
 * Cover photos and teaser videos are Adam's own, from the class media sheet he
 * maintains (COVERS and TEASERS below, mirroring data/class-media.csv). Two
 * classes he has not supplied yet keep a dish-matched cover from his media
 * library and no teaser; the card flags the gap rather than showing stock
 * imagery.
 *
 * For an existing row these only *fill* — see seedCourseCatalog. The sheet is
 * the authority and scripts/import-class-media.ts is how it is applied; a
 * re-seed must never walk that back.
 */
type SeedClass = { title: string; description: string };

const WP = "https://cinnamonsnail.com/wp-content/uploads";

/**
 * Class title -> dish photo, from Adam's class media sheet.
 */
const COVERS: Record<string, string> = {
  "2023 Vegan Christmas Dinner Class": `${WP}/2023/10/IMG_0849.jpg`,
  "2023 Vegan Thanksgiving Cooking Class": `${WP}/2024/04/Vegan-Apple-Pie-02.jpg`,
  "A Colosseum of Vegan Eggs": `${WP}/2025/06/vegan_breakfast_sandwich-15.jpg`,
  "A Vegan Hanukkah Kitchen: Root Veggies & Rituals": `${WP}/2025/02/vegan_latkes-03.jpg`,
  "Approachable Vegan Desserts": `${WP}/2023/06/banh-flan-feature-2.jpg`,
  "Around the World in Vegan Donuts": `${WP}/2025/02/matcha-donuts-11.jpg`,
  "Bangin' Tex-Mex Casseroles": `${WP}/2026/05/vegan_tamale_pie-2.jpg`,
  "Eastern European Jewish Vegan Food": `${WP}/2023/10/vegan-Jewish-food.jpg`,
  "Easy, Healthy Vegan Lunches": `${WP}/2023/10/easy-healthy-lunches.jpg`,
  "Essential Mexican Salsas": `${WP}/2025/07/salsa_ranchera-05.jpg`,
  "Gluten-Free Vegan Masterclass": `${WP}/2024/08/Cha-Ri-Chay-11.jpg`,
  "Homestyle Moroccan Cooking": `${WP}/2025/04/zaalouk-04.jpg`,
  "Legacy Vegan Cooking Class": `${WP}/2023/10/beastmode-burger-1.jpg`,
  "Make Better Meat, Vegan": `${WP}/2024/03/Vegan-Drumsticks-19.jpg`,
  "Make the Best Plant-Based Pizza": `${WP}/2023/10/Vegan-Pizza.jpg`,
  "Malaysian Vegan Cuisine": `${WP}/2023/08/Tahu-Goreng-features.jpg`,
  "Plant-Based Cheese School": `${WP}/2023/10/Vegan-Nacho-Cheese.jpg`,
  "Punjabi Thali Cuisine": `${WP}/2024/08/Rajma-Chawal-02.jpg`,
  "Saigon Flavor: Vegan Vietnamese Cooking Class": `${WP}/2023/11/banh-trang-cuon-04.jpg`,
  "Sattvic Vegan Indian Cuisine": `${WP}/2024/08/Beerakaya-Sabji-02.jpg`,
  "Seitan Masterclass": `${WP}/2023/03/seitan-in-a-white-bowl-feature.jpg`,
  "Southern Vegan BBQ Class Pack": `${WP}/2023/10/Vegan-BBQ.jpg`,
  "Spooky Vegan Halloween Party Prep": `${WP}/2025/07/vegan_halloween.jpg`,
  "The Best Falafel and Vegan Mezze": `${WP}/2024/06/Bolani-02.jpg`,
  "The Best Plant-Based Tacos": `${WP}/2024/02/Vegan-Fajitas-02.jpg`,
  "The Green Reaper: Vegan Salad Bible": `${WP}/2025/08/butternut_squash_salad-07.jpg`,
  "Vegan Cake Donut Mastery": `${WP}/2023/10/vegan-cake-donuts.jpg`,
  "Vegan Christmas Bundle Of Yummy": `${WP}/2023/10/vegan-Christmas-bundle.jpg`,
  "Vegan Dairy Crash Course": `${WP}/2024/04/Vegan-Cream-Cheese-Frosting-3.jpg`,
  "Vegan Dim Sum and Then Some": `${WP}/2023/04/chee-cheong-fun-feature-1-of-1.jpg`,
  "Vegan Easter Dinner Class": `${WP}/2024/02/Peep-cakes.jpeg`,
  "Vegan Empanadas Made Easy": `${WP}/2023/10/Vegan-Empanadas.jpg`,
  "Vegan Filipino Cooking Class": `${WP}/2023/04/Tofu-sisg-feature-1-of-1.jpg`,
  "Vegan Freezer Meals": `${WP}/2025/07/1.jpg`,
  "Vegan Indonesian BBQ": `${WP}/2025/02/Sambal-goreng-02.jpg`,
  "Vegan Italian American Cooking Class": `${WP}/2024/01/Vegan-Meatballs-03.jpg`,
  "Vegan Italian Desserts": `${WP}/2024/02/Vegan-Tiramisu-11.jpg`,
  "Vegan Korean Fried Chicken Workshop": `${WP}/2025/02/vegan_korean_fried_chicken-02.jpg`,
  "Vegan Mediterranean Cooking Class": `${WP}/2023/10/Mutabal-04.jpg`,
  "Vegan Mexican Cooking": `${WP}/2024/02/Vegan-Tamales-02.jpg`,
  "Vegan Mother's Day Cook-Along Brunch": `${WP}/2023/05/martabak-feature-2.jpg`,
  "Vegan Passover Prep-Along": `${WP}/2025/02/passover-class.jpg`,
  "Vegan Sandwich Hall of Fame Cooking Class": `${WP}/2023/10/thai-bbq-tempeh.jpg`,
  "Vegan Shabbat Dinner": `${WP}/2025/02/vegan_cholent-04.jpg`,
  "Vegan Soup Workshop": `${WP}/2025/07/Vegan_soup_class.jpg`,
  "Vegan Thai Kitchen Adventures": `${WP}/2024/01/Thai-Basil-Eggplant-16.jpg`,
  "Vegan Thanksgiving Training Camp": `${WP}/2024/09/Thanksgiving_Vegan_Stuffing-02.jpg`,
  "Vegan Turkish Cuisine": `${WP}/2023/06/Ezogelin-feature.jpg`,
  "Vegan Valentine's Treats": `${WP}/2025/01/vegan_valentines_class.jpg`,
  "Veganized Chinese Takeout Classics": `${WP}/2023/10/Chinese-food.jpg`,

  // Not in Adam's sheet. These two are dish-matched from his media library
  // and are the only unconfirmed covers left; the teaser is still missing for
  // both, so they are on the hand-back list either way.
  "Supreme Vegan Mexican Tortas": `${WP}/2026/01/vegan_torta_adobada-04.jpg`,
  "Insanely Yummy Vietnamese Soups": `${WP}/2025/12/vegan_bo_kho-03.jpg`,
};

/**
 * Class title -> teaser video, from the same sheet.
 *
 * `Bangin' Tex-Mex Casseroles` and `The Green Reaper: Vegan Salad Bible` carry
 * the same embed id in the sheet (jU6Sasix5tY). Applied as given rather than
 * guessed at, and raised with Adam — one of the two is likely a copy-paste.
 */
const TEASERS: Record<string, string> = {
  "2023 Vegan Christmas Dinner Class": "https://www.youtube.com/embed/GuhyvG7W48c",
  "2023 Vegan Thanksgiving Cooking Class": "https://www.youtube.com/embed/FueK_7bFyn4",
  "A Colosseum of Vegan Eggs": "https://www.youtube.com/embed/_ArcS8qnsCc",
  "A Vegan Hanukkah Kitchen: Root Veggies & Rituals": "https://www.youtube.com/embed/UfXxxL-8hFM",
  "Approachable Vegan Desserts": "https://www.youtube.com/embed/rxc3Wf91nXw",
  "Around the World in Vegan Donuts": "https://www.youtube.com/embed/0fVeU5ibqyQ",
  "Bangin' Tex-Mex Casseroles": "https://www.youtube.com/embed/jU6Sasix5tY",
  "Eastern European Jewish Vegan Food": "https://www.youtube.com/embed/DBOmecV7lC4",
  "Easy, Healthy Vegan Lunches": "https://www.youtube.com/embed/5tcIieNpUFE",
  "Essential Mexican Salsas": "https://www.youtube.com/embed/S5HbKiChalA",
  "Gluten-Free Vegan Masterclass": "https://www.youtube.com/embed/jrvchgy0CsM",
  "Homestyle Moroccan Cooking": "https://www.youtube.com/embed/JTOjiAqiPe8",
  "Legacy Vegan Cooking Class": "https://www.youtube.com/embed/Cg9EDJHA8F8",
  "Make Better Meat, Vegan": "https://www.youtube.com/embed/hsFe68tzVRQ",
  "Make the Best Plant-Based Pizza": "https://www.youtube.com/embed/outoSPUMSJw",
  "Malaysian Vegan Cuisine": "https://www.youtube.com/embed/tlrFaPvVfHc",
  "Plant-Based Cheese School": "https://www.youtube.com/embed/Z5AIWleZF1w",
  "Punjabi Thali Cuisine": "https://www.youtube.com/embed/dvCVZOU6Dc8",
  "Saigon Flavor: Vegan Vietnamese Cooking Class": "https://www.youtube.com/embed/LY4N4Spyabo",
  "Sattvic Vegan Indian Cuisine": "https://www.youtube.com/embed/gl_3FhDyOMw",
  "Seitan Masterclass": "https://www.youtube.com/embed/Y1NjLeWWyRw",
  "Southern Vegan BBQ Class Pack": "https://www.youtube.com/embed/1rLYukUcw6c",
  "Spooky Vegan Halloween Party Prep": "https://www.youtube.com/embed/tRgZSWZDh14",
  "The Best Falafel and Vegan Mezze": "https://www.youtube.com/embed/v-HHjWDLObk",
  "The Best Plant-Based Tacos": "https://www.youtube.com/embed/R5tjAujpa8A",
  "The Green Reaper: Vegan Salad Bible": "https://www.youtube.com/embed/jU6Sasix5tY",
  "Vegan Cake Donut Mastery": "https://www.youtube.com/embed/P_ponW1ZU24",
  "Vegan Christmas Bundle Of Yummy": "https://www.youtube.com/embed/cuIrnXG5EdU",
  "Vegan Dairy Crash Course": "https://www.youtube.com/embed/EUiV2E_rd6k",
  "Vegan Dim Sum and Then Some": "https://www.youtube.com/embed/IrGTvhAiYbo",
  "Vegan Easter Dinner Class": "https://www.youtube.com/embed/Z14VDuqwLlE",
  "Vegan Empanadas Made Easy": "https://www.youtube.com/embed/CNPbTEN2yjA",
  "Vegan Filipino Cooking Class": "https://www.youtube.com/embed/SyhKhMBMoPY",
  "Vegan Freezer Meals": "https://www.youtube.com/embed/d_2yTChyCn4",
  "Vegan Indonesian BBQ": "https://www.youtube.com/embed/vaWImXb9DOQ",
  "Vegan Italian American Cooking Class": "https://www.youtube.com/embed/l655gT87zuA",
  "Vegan Italian Desserts": "https://www.youtube.com/embed/Sb2gHkoGtCc",
  "Vegan Korean Fried Chicken Workshop": "https://www.youtube.com/embed/H8fPhH3Pv8s",
  "Vegan Mediterranean Cooking Class": "https://www.youtube.com/embed/b_66I6UW8ew",
  "Vegan Mexican Cooking": "https://www.youtube.com/embed/rFhEgXRaI9U",
  "Vegan Mother's Day Cook-Along Brunch": "https://www.youtube.com/embed/qfx5N5kmCGs",
  "Vegan Passover Prep-Along": "https://www.youtube.com/embed/9Lt4BckWON8",
  "Vegan Sandwich Hall of Fame Cooking Class": "https://www.youtube.com/embed/ygK9AkyXkc0",
  "Vegan Shabbat Dinner": "https://www.youtube.com/embed/kVk6mYpTeFY",
  "Vegan Soup Workshop": "https://www.youtube.com/embed/ASw2RwIrLgI",
  "Vegan Thai Kitchen Adventures": "https://www.youtube.com/embed/Jh8Ji0Mudwo",
  "Vegan Thanksgiving Training Camp": "https://www.youtube.com/embed/H_0fD5O7jzA",
  "Vegan Turkish Cuisine": "https://www.youtube.com/embed/E6cSjYttY30",
  "Vegan Valentine's Treats": "https://www.youtube.com/embed/KPiSPgnHwqc",
  "Veganized Chinese Takeout Classics": "https://www.youtube.com/embed/VWPN5tBAbFQ",
};

const CATALOG: { category: string; classes: SeedClass[] }[] = [
  {
    category: "Regional & World Cuisine",
    classes: [
      { title: "Supreme Vegan Mexican Tortas", description: "Barbecue jackfruit tortas with fresh toppings." },
      { title: "Insanely Yummy Vietnamese Soups", description: "Aromatic Vietnamese broths and accompaniments." },
      { title: "Homestyle Moroccan Cooking", description: "Traditional Moroccan flavor and technique." },
      { title: "Vegan Indonesian BBQ", description: "Indonesian grilling with plant-based proteins." },
      { title: "Vegan Filipino Cooking Class", description: "Classic Filipino dishes and flavors." },
      { title: "Punjabi Thali Cuisine", description: "A full Punjabi multi-course spread." },
      { title: "Saigon Flavor: Vegan Vietnamese Cooking Class", description: "Vietnamese street food, veganized." },
      { title: "Vegan Mexican Cooking", description: "Foundational Mexican technique and recipes." },
      { title: "Vegan Mediterranean Cooking Class", description: "Mediterranean dishes, plant-based." },
      { title: "Sattvic Vegan Indian Cuisine", description: "Ayurvedic Indian cooking, plant-based." },
      { title: "Malaysian Vegan Cuisine", description: "Malaysian technique and regional specialties." },
      { title: "Eastern European Jewish Vegan Food", description: "Traditional Jewish dishes, veganized." },
      { title: "Vegan Thai Kitchen Adventures", description: "Thai technique and flavor building." },
      { title: "Vegan Turkish Cuisine", description: "Turkish specialties, plant-based." },
      { title: "The Best Falafel and Vegan Mezze", description: "Falafel and Mediterranean spreads." },
      { title: "Veganized Chinese Takeout Classics", description: "Takeout favorites, made plant-based." },
      { title: "Vegan Dim Sum and Then Some", description: "Dim sum and small plates." },
    ],
  },
  {
    category: "Techniques & Substitutes",
    classes: [
      { title: "Vegan Dairy Crash Course", description: "Cheese, butter, and dairy from scratch." },
      { title: "Plant-Based Cheese School", description: "Cheese sauces and cheese blocks." },
      { title: "Seitan Masterclass", description: "Wheat-gluten protein, start to finish." },
      { title: "Make Better Meat, Vegan", description: "Convincing plant-based meat substitutes." },
      { title: "Gluten-Free Vegan Masterclass", description: "Gluten-free technique and swaps." },
      { title: "A Colosseum of Vegan Eggs", description: "Every egg substitute, tested." },
    ],
  },
  {
    category: "Holidays & Celebrations",
    classes: [
      { title: "Vegan Shabbat Dinner", description: "A full plant-based Shabbat table." },
      { title: "A Vegan Hanukkah Kitchen: Root Veggies & Rituals", description: "Hanukkah, root-vegetable-forward." },
      { title: "Spooky Vegan Halloween Party Prep", description: "Halloween party food, including donuts." },
      { title: "Vegan Passover Prep-Along", description: "Passover-compliant recipes and planning." },
      { title: "Vegan Valentine's Treats", description: "Romantic desserts for two." },
      { title: "Vegan Mother's Day Cook-Along Brunch", description: "A full celebration brunch." },
      { title: "Vegan Easter Dinner Class", description: "A festive Easter spread." },
      { title: "Vegan Thanksgiving Training Camp", description: "The whole Thanksgiving table." },
      { title: "Vegan Christmas Bundle Of Yummy", description: "A full Christmas dessert lineup." },
      { title: "2023 Vegan Thanksgiving Cooking Class", description: "Classic Thanksgiving sides and mains." },
      { title: "2023 Vegan Christmas Dinner Class", description: "A full Christmas dinner menu." },
    ],
  },
  {
    category: "Weeknight, Casual & Comfort Food",
    classes: [
      { title: "The Green Reaper: Vegan Salad Bible", description: "Salads worth building a meal around." },
      { title: "Bangin' Tex-Mex Casseroles", description: "Layered Tex-Mex comfort food." },
      { title: "Essential Mexican Salsas", description: "Every salsa you actually need." },
      { title: "Vegan Soup Workshop", description: "Soups and stews, several styles." },
      { title: "Vegan Freezer Meals", description: "Batch cook now, eat all month." },
      { title: "Vegan Italian American Cooking Class", description: "Red-sauce classics, veganized." },
      { title: "Vegan Sandwich Hall of Fame Cooking Class", description: "Next-level sandwich building." },
      { title: "Easy, Healthy Vegan Lunches", description: "Quick lunches for a normal week." },
      { title: "The Best Plant-Based Tacos", description: "Taco fillings and technique." },
      { title: "Make the Best Plant-Based Pizza", description: "Dough, sauce, and toppings." },
      { title: "Vegan Korean Fried Chicken Workshop", description: "Crispy, saucy, Korean-style." },
      { title: "The Perfect Vegan Brunch Cooking Class", description: "A full brunch spread, start to finish." },
    ],
  },
  {
    category: "Baking & Desserts",
    classes: [
      { title: "Around the World in Vegan Donuts", description: "Global donut styles, veganized." },
      { title: "Vegan Italian Desserts", description: "Classic Italian sweets, plant-based." },
      { title: "Vegan Cake Donut Mastery", description: "Cake donuts, glazes, and flavors." },
      { title: "Approachable Vegan Desserts", description: "Easy desserts for any skill level." },
      { title: "Vegan Empanadas Made Easy", description: "Pastry and fillings, simplified." },
    ],
  },
  {
    category: "Bundles & Deep Dives",
    classes: [
      { title: "Legacy Vegan Cooking Class", description: "Gourmet burgers and elevated comfort food." },
      { title: "Southern Vegan BBQ Class Pack", description: "Southern barbecue, sauces included." },
    ],
  },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function seedCourseCatalog(prisma: PrismaClient) {
  let created = 0;
  let updated = 0;

  for (const [categoryIndex, group] of CATALOG.entries()) {
    for (const [classIndex, entry] of group.classes.entries()) {
      const slug = slugify(entry.title);
      const existing = await prisma.course.findUnique({ where: { slug } });
      const cover = COVERS[entry.title] ?? null;
      const teaser = TEASERS[entry.title] ?? null;
      const data = {
        title: entry.title,
        description: entry.description,
        published: true,
        category: group.category,
        categoryOrder: categoryIndex,
        catalogOrder: classIndex,
        instructorName: "Adam Sobel",
      };
      if (existing) {
        // Media fills, never overwrites. Adam's sheet is applied by
        // scripts/import-class-media.ts and can be ahead of this file; a
        // re-seed that reset coverUrl would silently undo his photos.
        await prisma.course.update({
          where: { slug },
          data: {
            ...data,
            ...(existing.coverUrl ? {} : { coverUrl: cover }),
            ...(existing.teaserVideoUrl ? {} : { teaserVideoUrl: teaser }),
          },
        });
        updated += 1;
      } else {
        await prisma.course.create({
          data: { slug, ...data, coverUrl: cover, teaserVideoUrl: teaser },
        });
        created += 1;
      }
    }
  }

  const classCount = CATALOG.reduce((total, g) => total + g.classes.length, 0);
  const entries = CATALOG.flatMap((g) => g.classes);
  const withCovers = entries.filter((entry) => COVERS[entry.title]).length;
  const withTeasers = entries.filter((entry) => TEASERS[entry.title]).length;
  console.log(
    `Catalog: ${classCount} classes in ${CATALOG.length} categories (${created} created, ${updated} updated).`,
  );
  console.log(
    `Covers: ${withCovers} of ${classCount}. Teasers: ${withTeasers} of ${classCount}.`,
  );
}

/**
 * Standalone entrypoint, so the catalog can be seeded on its own:
 *
 *   npx tsx prisma/seed-catalog.ts
 *
 * This is the production-safe seed: it writes only the real class list. The
 * full `prisma/seed.ts` also creates demo members and a test feed, which must
 * never run against production.
 */
async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    await seedCourseCatalog(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

// Only run when executed directly, not when imported by prisma/seed.ts.
// Compared on basename so it works with either path separator.
const entry = process.argv[1] ?? "";
const invokedDirectly =
  entry.endsWith("seed-catalog.ts") || entry.endsWith("seed-catalog.js");

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

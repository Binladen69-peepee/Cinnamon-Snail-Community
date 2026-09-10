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
 * Cover photos come from Adam's own WordPress media library on
 * cinnamonsnail.com, matched dish-to-class where a real photo of that dish
 * exists (COVERS below). Classes with no matching photo stay null and the card
 * flags the gap rather than showing stock imagery. Teaser videos are still
 * pending from the Drive folder.
 */
type SeedClass = { title: string; description: string };

const WP = "https://cinnamonsnail.com/wp-content/uploads";

/**
 * Class title -> real dish photo from Adam's media library. Only confident
 * matches: the photo is of the dish that class actually teaches. Anything
 * uncertain is left out so a card flags for a real photo instead of showing
 * something misleading.
 */
const COVERS: Record<string, string> = {
  "Supreme Vegan Mexican Tortas": `${WP}/2026/01/vegan_torta_adobada-04.jpg`,
  "Insanely Yummy Vietnamese Soups": `${WP}/2025/12/vegan_bo_kho-03.jpg`,
  "Saigon Flavor: Vegan Vietnamese Cooking Class": `${WP}/2024/01/Vegan-Banh-Mi-21-720x960.jpg`,
  "Homestyle Moroccan Cooking": `${WP}/2026/08/Moroccan_sweet_potato_soup-2-2-720x960.jpg`,
  "Vegan Filipino Cooking Class": `${WP}/2023/11/Ginataang-Kalabasa-5-720x960.jpg`,
  "Punjabi Thali Cuisine": `${WP}/2024/08/Rajma-Chawal-02-300x300.jpg`,
  "Vegan Mexican Cooking": `${WP}/2024/08/Adobo-Sauce-01-720x960.jpg`,
  "Vegan Mediterranean Cooking Class": `${WP}/2025/05/Persian_rice-06-720x960.jpg`,
  "Sattvic Vegan Indian Cuisine": `${WP}/2024/08/Aloo-Gobi-05-720x960.jpg`,
  "Vegan Thai Kitchen Adventures": `${WP}/2024/01/Thai-Basil-Eggplant-16-720x960.jpg`,
  "Vegan Turkish Cuisine": `${WP}/2023/10/Soslu-Patlican-06-720x960.jpg`,
  "The Best Falafel and Vegan Mezze": `${WP}/2023/04/Bulgur-Pilavi-Feature-Alt-1-of-1-720x960.jpg`,
  "Vegan Dim Sum and Then Some": `${WP}/2024/06/Vegan-Sushi-Bake-01-720x960.jpg`,
  "Vegan Dairy Crash Course": `${WP}/2025/08/vegan_butternut_squash_mac_and_cheese-04-720x960.jpg`,
  "Vegan Shabbat Dinner": `${WP}/2026/08/vegan_mukver-8-720x960.jpg`,
  "Spooky Vegan Halloween Party Prep": `${WP}/2025/09/Vegan_pumpkin_cheesecake-02-720x960.jpg`,
  "Vegan Mother's Day Cook-Along Brunch": `${WP}/2024/06/Vegan-Apple-Muffins-02-720x960.jpg`,
  "Vegan Easter Dinner Class": `${WP}/2025/10/vegan_mushroom_wellington-01-720x960.jpg`,
  "Vegan Thanksgiving Training Camp": `${WP}/2024/09/Vegan-Turkey-Roast-01-720x960.jpg`,
  "2023 Vegan Thanksgiving Cooking Class": `${WP}/2024/09/Vegan_Cornbread_Stuffing-03-720x960.jpg`,
  "Vegan Christmas Bundle Of Yummy": `${WP}/2024/10/Vegan-Christmas-Cookies-21-300x300.jpg`,
  "2023 Vegan Christmas Dinner Class": `${WP}/2024/10/Vegan-ham-07-720x960.jpg`,
  "The Green Reaper: Vegan Salad Bible": `${WP}/2025/08/butternut_squash_salad-07-720x960.jpg`,
  "Essential Mexican Salsas": `${WP}/2024/05/Habanero-Salsa-04-720x960.jpg`,
  "Vegan Soup Workshop": `${WP}/2025/09/vegan_mushroom_soup-04-720x960.jpg`,
  "Vegan Freezer Meals": `${WP}/2025/08/vegan_shepherds_pie-06-720x960.jpg`,
  "Vegan Italian American Cooking Class": `${WP}/2025/08/mushroom_bourguignon-02-720x960.jpg`,
  "Vegan Korean Fried Chicken Workshop": `${WP}/2023/05/Korean-BBQ-Sauce-feature-2-720x960.jpg`,
  "Easy, Healthy Vegan Lunches": `${WP}/2023/04/Korean-cucumber-salad-feature-1-of-1-720x960.jpg`,
  "Approachable Vegan Desserts": `${WP}/2025/10/vegan_apple_crisp-01-720x960.jpg`,
  "Vegan Empanadas Made Easy": `${WP}/2026/08/vegan_zucchini_muffins-8-720x960.jpg`,
  "Legacy Vegan Cooking Class": `${WP}/2026/08/Chipotle_butternut_squash_soup-2-720x960.jpg`,
  "Southern Vegan BBQ Class Pack": `${WP}/2026/08/kabocha_squash_soup-5-720x960.jpg`,
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
      const data = {
        title: entry.title,
        description: entry.description,
        published: true,
        category: group.category,
        categoryOrder: categoryIndex,
        catalogOrder: classIndex,
        instructorName: "Adam Sobel",
        coverUrl: COVERS[entry.title] ?? null,
      };
      if (existing) {
        await prisma.course.update({ where: { slug }, data });
        updated += 1;
      } else {
        await prisma.course.create({ data: { slug, ...data } });
        created += 1;
      }
    }
  }

  const classCount = CATALOG.reduce((total, g) => total + g.classes.length, 0);
  const withCovers = CATALOG.flatMap((g) => g.classes).filter(
    (entry) => COVERS[entry.title],
  ).length;
  console.log(
    `Catalog: ${classCount} classes in ${CATALOG.length} categories (${created} created, ${updated} updated).`,
  );
  console.log(
    `Covers: ${withCovers} real dish photos matched, ${classCount - withCovers} still flagged.`,
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

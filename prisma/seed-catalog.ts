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
 * Cover photos and teaser videos are intentionally left null — they come from
 * Adam's WordPress media library and the teaser Drive folder, and the catalog
 * cards flag the gap rather than showing stock imagery.
 */
type SeedClass = { title: string; description: string };

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
  console.log(
    `Catalog: ${classCount} classes in ${CATALOG.length} categories (${created} created, ${updated} updated).`,
  );
}

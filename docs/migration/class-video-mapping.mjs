// Class → Drive video mapping for the Bunny migration (read-only inventory).
// Source: Google Drive of adam@cinnamonsnail.com, "Cooking Classes" (My Drive),
// inventoried 2026-10-08. Nothing was downloaded, moved or changed.
//
//   node docs/migration/class-video-mapping.mjs   → writes the .csv and .md beside it
//
// Folders:
//   Recordings = Cooking Classes / Cooking Class Recordings
//   Edited     = Cooking Classes / Edited Cooking Class Recordings
// A second, older "Cooking Classes" tree exists (same names and sizes, other
// file IDs, none of the 2026 recordings); it is a duplicate and is not used.
//
// Versions: Final = edited export (Edited folder, or "Final"/"Fix" in the name);
// Compressed = smaller re-export of a large file; Raw = the live recording as
// uploaded; Raw (large) = an uncompressed master over 5 GB; Copy = a Drive
// duplicate of another file (same size).

import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const GB = (bytes) => (bytes / 1e9).toFixed(2);
const f = (name, id, bytes, folder, version) => ({ name, id, bytes, folder, version });

/** [class, recommended file, other files, ambiguity, note] */
const MAP = [
  ["2023 Vegan Christmas Dinner Class", f("2023 vegan Christmas dinner.mp4", "1wyc8KbeZpFsQ7i1YRQrBnTdley0klREb", 931658221, "Recordings", "Compressed"), [], "Medium", "Only file for this class: a 0.9 GB re-export uploaded 2024-02-21 with the other compressed copies (classes are usually ~3 GB). The original recording is not in Drive. Check it runs the whole class."],
  ["2023 Vegan Thanksgiving Cooking Class", f("2023 thanksgiving compressed.mp4", "126AGxYVha9jyRalpsNVCRTnkE-jRDz04", 3083517797, "Recordings", "Compressed"), [f("2023 thanksgiving.mp4", "10P5z1OiDfCZE4PztnIwyaKEC2XEAhV8k", 5982214593, "Recordings", "Raw (large)"), f("2023 thanksgiving.mov", "1yI3cn1xcyShACQ6qLPLI-PW-B8lj0nn9", 5981962691, "Recordings", "Raw (large)"), f("2023 Vegan Thanksgiving Dinner Class.mp4", "1eeRnLLJom7_Du6FO6cGxJrrF2uALWTe6", 2846241978, "Recordings", "Raw")], "Medium", "Two different 2023 exports: the 6 GB edit (and its compressed copy) and a separately named 2.8 GB recording from the same evening. Confirm which one members watch."],
  ["A Colosseum of Vegan Eggs", f("A Colosseum of Vegan Eggs.mov", "1Iu0Sosrg77uiDmnrh3VFn6A0ufjGahjJ", 1626998077, "Recordings", "Raw"), [], "None", ""],
  ["A Vegan Hanukkah Kitchen: Root Veggies & Rituals", f("Hanukkah Class.mov", "1H33D8Q_kmwugs1RN7qKEQ-jN_b09RAiZ", 1735588702, "Recordings", "Raw"), [], "Low", "File is named \"Hanukkah Class\" (Dec 2025). \"Vegan Potato Kugel.mp4\" (0.58 GB) is a recipe video, not this class."],
  ["Approachable Vegan Desserts", f("Approachable Vegan Desserts.mp4", "1HOSZZzATPVEEbHL6evgRdXX7FICrlL_u", 1524924869, "Recordings", "Raw"), [], "None", ""],
  ["Around the World in Vegan Donuts", f("Around the world in vegan donuts.mov", "1FgqGdHhCwdRATjnN6EZUDjc0G2vEks1q", 2228184980, "Recordings", "Raw"), [], "Low", "2025 class. \"Supreme vegan donut making bonanza.mp4\" (2022) and \"Cake donut mastery.mp4\" are different classes."],
  ["Bangin' Tex-Mex Casseroles", f("Bangin' Tex Mex Casseroles.mov", "1BwvoFkfcCgBlzWw4NX12PU3yfb1UrYl1", 1701451323, "Recordings", "Raw"), [], "None", "\"Tex Mex Casseroles.mov\" (0.12 GB, another folder) is a promo clip."],
  ["Eastern European Jewish Vegan Food", f("Eastern European Vegan Cuisine.mp4", "1sAQwN8xz0wxp8DNbzIWhJdN57eza3ucO", 3171814131, "Recordings", "Raw"), [], "Low", "File name says \"Cuisine\", not \"Jewish Food\"; only candidate."],
  ["Easy, Healthy Vegan Lunches", f("Easy Healthy Lunches Final.mp4", "1EVt1BFETwderJ5VuvcwDfg8q983igMPd", 3268627684, "Edited", "Final"), [f("Healthy Lunches.mp4", "1fEI6PpAJApfAuMJEy2ygo5FJOFMGGXpy", 1342792163, "Recordings", "Raw")], "None", ""],
  ["Essential Mexican Salsas", f("Essential Salsas.mov", "11SAUj-q0HLSrUm0N7YE7r15rOL9BZAva", 1572603154, "Recordings", "Raw"), [], "None", ""],
  ["Gluten-Free Vegan Masterclass", f("Gluten Free Master Final.mp4", "1v8cwizk0fNEte1MDgk9TSlq9J5Fua98U", 3609306095, "Edited", "Final"), [f("Gluten free master class.mp4", "1Wy96HppDfR7qLP9si0P13D7My3afUwIo", 3279225654, "Recordings", "Raw"), f("Gluten Free Master Final.mp4", "18-V-tNm5n4hr4Luzpc56OLEvJUoX9kvh", 3609306095, "Recordings", "Copy")], "None", ""],
  ["Homestyle Moroccan Cooking", f("Homestyle Moroccan Cooking.mov", "1shWZGCVjQ8_-XsuQJimLCvFUcENltVKL", 2200245846, "Recordings", "Raw"), [], "None", ""],
  ["Legacy Vegan Cooking Class", f("Beastmode Class VU.mov", "1HZu3GWIODzzQY1w9o4Nz9Fch7DVOgKQV", 2728895312, "Recordings", "Raw"), [f("Beastmode Burger Workshop.mov", "1rc-ly5QV1pTmWcWxwsVmfw6pBYx5Y5RA", 1240178312, "Recordings", "Raw"), f("Vegan Burger Making Class-2.mp4", "1T-lLV-ecJ8qgzCs0OCtU7ZdguP45DxkN", 480920854, "Recordings", "Raw")], "High", "The site describes this class as gourmet burgers (Beastmode Burger thumbnail). Three burger recordings exist: the 2025 Beastmode workshop (1.2 GB), a \"VU\" version of it a day later (2.7 GB), and a 2022 \"Burger Making Class-2\" that looks like part 2 of an older class."],
  ["Make Better Meat, Vegan", f("Final- Make Better Meat, Vegan.mp4", "1wpsTtv4bTZudrQeb4sS4_GB6vYL4KOVW", 2203977642, "Edited", "Final"), [f("Make Better Meat, Vegan.mp4", "1lfVtu03fjiFJMMt2TmUZGLFfYlHaAarf", 2343436494, "Recordings", "Raw")], "None", ""],
  ["Make the Best Plant-Based Pizza", f("Plant Based Pizza Compressed.mp4", "1DcqtUciooqXLSu10OXB_6u3M0BgeV5r8", 3705767276, "Recordings", "Compressed"), [f("plant based pizza.mp4", "1N-a7HOMK_9CNpBsHIKlNlXflNjD6w00u", 18096816571, "Recordings", "Raw (large)"), f("plant based pizza.mov", "1KDJWOIdbO3IVst8FcCHATSa_CYikHMRx", 7948085740, "Recordings", "Raw (large)"), f("plant based pizza (1782194485899).mov", "18YoAThBP0uostbQPqeseUH_KHIJwwJJm", 7948085740, "Recordings", "Copy")], "Low", "Compressed (3.7 GB) was made the same day as the 7.9 GB edit; check it is the full class before skipping the 18 GB master."],
  ["Malaysian Vegan Cuisine", f("Malaysian Vegan Cuisine.mp4", "1ejK7CD1qNkTYLu8HTuFPosH8XmOJkG1r", 2798482564, "Recordings", "Raw"), [], "None", ""],
  ["Plant-Based Cheese School", f("Plant-Based Chesse School.mp4", "1cK3XI_iaL8HMbMlqYVRDkevQl6yg4t3s", 3169210326, "Edited", "Final"), [f("plant based cheese school.mp4", "1nclJLcge1INIKYUBGyxNFmK9rap8oSu-", 1387732292, "Recordings", "Raw"), f("Plant-Based Chesse School.mp4", "17cJePEt9VwWtMZCNh7FtEapjtgT2YsMX", 3169210326, "Recordings", "Copy")], "None", "\"Fantastic Creations With Artisan Vegan Cheese.mp4\" (2023) is a different class, not in the 51."],
  ["Punjabi Thali Cuisine", f("punjabi thali cuisine.mp4", "11pPpQP_xG45iLKWnOUqJYqJCDanFhVn0", 3109626746, "Recordings", "Raw"), [], "None", ""],
  ["Saigon Flavor: Vegan Vietnamese Cooking Class", f("SaigonFlavors - Final.mp4", "1kAsRzZOuhvum59iU4iplkFUlrYRUsYB0", 2941585298, "Edited", "Final"), [f("Saigon Flavors: Vegan Vietnamese Cooking.mp4", "1gWLNQIwETA1wPI5fiogtp3VNyUL4vZY_", 3301860070, "Recordings", "Raw")], "None", ""],
  ["Sattvic Vegan Indian Cuisine", f("Sattvic Vegan Indian.mp4", "1Tf8is2NGpcr6VdPBID3Pe4CW5_aVvByk", 3052255553, "Recordings", "Raw"), [], "None", ""],
  ["Seitan Masterclass", f("Seitan Masterclass.mp4", "1ylwRWwlwxETHvezCrh3GT-_oGMtdqjfy", 3404049793, "Edited", "Final"), [f("Seitan Masterclass.mp4", "1Sy0wGHpI2wiYHPTM5KmAbW6ZicDEULNV", 1679854389, "Recordings", "Raw")], "Low", "Both files have the same name; migrate by ID (the 3.4 GB one in Edited)."],
  ["Southern Vegan BBQ Class Pack", f("Vegan Southern Cuisine.mp4", "1_2ZJhoNB3laPxjKLzADfJewE0sNHVBwh", 2741826270, "Recordings", "Raw"), [f("Plant Chaos Vegan BBQ.mp4", "1e5c7GzIFB6BVfu5ZyzYlOx05XmERFYVV", 3677409657, "Recordings", "Raw")], "High", "A \"class pack\" is probably several recordings. Likely Vegan Southern Cuisine (2023) and Plant Chaos Vegan BBQ (2022); Korean BBQ Seitan and Indonesian BBQ are separate classes."],
  ["Spooky Vegan Halloween Party Prep", f("Spooky Halloween Treats.mov", "1brXbqPb7SK_70N8jrMee0DM4khAiVAFt", 2168299184, "Recordings", "Raw"), [], "Low", "File says \"Treats\", class says \"Party Prep\"; only Halloween recording."],
  ["The best falafel and vegan meze", f("Falafel and meze.mp4", "1pNUUUQrAP0Qsy2DG2clJsw2PlDXU6qjW", 2797516559, "Recordings", "Raw"), [], "None", "The catalog also lists \"The Best Falafel and Vegan Mezze\"; same class, same video."],
  ["The best plant-based tacos", f("The Best Plant-Based Tacos.mp4", "1kDXGV9sUypt1lFJHnmxuEb9d_X1llJ0y", 3773069804, "Recordings", "Raw"), [], "None", ""],
  ["The Green Reaper: Vegan Salad Bible", f("The Green Reaper- Vegan Salad Bible.mov", "1sDdmnw4ctGwtlHV5oZ-M3gTOEzhBKNwt", 1619691225, "Recordings", "Raw"), [], "None", "\"Salad Class.mov\" (0.15 GB, another folder) is a promo clip."],
  ["The Perfect Vegan Brunch Cooking Class", f("The Perfect vegan brunch.mp4", "1_OvTUcTDs2RKKQ_IE0MxQZ2NCzDXgUbP", 2512604680, "Recordings", "Raw"), [], "Low", "Other brunch recordings are other classes: Killer Vegan Brunch (2021), Brunch in 45 mins (2022), Mother's Day Brunch (2024)."],
  ["Vegan Cake Donut Mastery", f("Cake donut mastery.mp4", "1ZarNBZkHQCm7jFH0sPJTD3vm3aU47OTn", 3512441987, "Recordings", "Raw"), [], "None", ""],
  ["Vegan Christmas Bundle Of Yummy", f("Big Vegan Christmas Dinner.mp4", "1vmWd9d6UG1y1QdYgH0ML22yv-NMRk76J", 3042786301, "Recordings", "Raw"), [f("Vegan Holiday Gifts and Stocking Stuffers.mov", "1Lm_zUQBp69-VZmwXwpYM_MzCZXrn0VU9", 3408963398, "Recordings", "Compressed"), f("Vegan Holiday Gifts and Stocking Stuffers.mp4", "1LTvAc9rwqSN_XzkkQMP-X803v1DqVTOw", 7768166515, "Recordings", "Raw (large)")], "High", "A \"bundle\": probably the 2022 Big Vegan Christmas Dinner plus Holiday Gifts and Stocking Stuffers (the 3.4 GB .mov is a later re-export of the 7.8 GB original). The 2023 Christmas dinner is its own class."],
  ["Vegan Dairy Crash Course", f("Vegan Dairy Crash Course Final.mp4", "1pyLqspY5TFIm50hYFHMDKEQgPC52aZBv", 3496384747, "Edited", "Final"), [f("Vegan Dairy Crash Course.mp4", "1moJUcQS6qa3ih3LZmbRCBVd-xxMuTisq", 3147223860, "Recordings", "Raw")], "None", ""],
  ["Vegan Dim Sum and Then Some", f("Vegan Dim Sum and Then Some.mp4", "1jPZp3K0BIi-aIADzLMRBoLddHYl55gdS", 3111271843, "Recordings", "Raw"), [], "None", ""],
  ["Vegan Easter Dinner Class", f("Vegan Easter Compressed.mp4", "19G_o9LIAfIaVvbBmmq5DwVkEVJQIQLYF", 3056544911, "Recordings", "Compressed"), [f("Vegan Easter Dinner.mp4", "1Yn6pSUJXEMWzpjWRyi4CdooZFFEuex3n", 9000658547, "Recordings", "Raw (large)")], "Low", "Compressed copy of the 9 GB master, made the next day."],
  ["Vegan Empanadas Made Easy", f("vegan empanadas made easy.mp4", "1c_9UzQc2EhYWdAwgycIT6b7QtR0DW5sE", 1422804399, "Recordings", "Raw"), [], "None", ""],
  ["Vegan Filipino Cooking Class", f("Vegan Filipino Cuisine.mp4", "1A-LKRq05eVN4QP2jsdJVnqbGVCKhJMLX", 2781039198, "Edited", "Final"), [f("Vegan Filipino Cuisines PART 1.mp4", "12PpFtWBb1EmA3LMhbAOs03ZsDCv3i_9d", 3567248327, "Recordings", "Raw"), f("Vegan Filipino Cuisine PART2.mp4", "1d6CogWz34b5Vms0h8QLfC8At18ixwCMp", 3857730145, "Recordings", "Raw"), f("Vegan Filipino Cuisine.mp4", "1ttjKSoR7untBHmyLYy11B6JS24tkSNNV", 2781039198, "Recordings", "Copy")], "Medium", "The edit (2.8 GB) should join Part 1 and Part 2 (7.4 GB together). Check it covers both parts."],
  ["Vegan Freezer Meals", f("Vegan Freezer Meals.mp4", "1QWAh6L0RGx4fp9O5RCu_5he3ZwF-fPPL", 2205270215, "Edited", "Final"), [f("Vegan Freezer Meals.mov", "1XslJzuwlq_AcH3aMRa_HwPsedHQmmA1y", 1824151681, "Recordings", "Raw")], "None", ""],
  ["Vegan Indonesian BBQ", f("Indonesian BBQ.mov", "1Vmkn35UC0AJWSlYVtL9MgikTJmQpLKyG", 1584554690, "Recordings", "Raw"), [], "None", ""],
  ["Vegan Italian American Cooking Class", f("Italian American Classics Final 2.mp4", "1WojBNYCwbJHGTcNzoUKrN1ll4UlFUodz", 2327039320, "Edited", "Final"), [f("Italian American Classics.mp4", "1l4YKiNiqHJdJHP4G8aSnPNJkNytpCVcd", 3460749203, "Recordings", "Raw"), f("Italian American Reels.mp4", "1dzVHpDfmbeWHOHkXQUb_gHjhsb1eM5au", 52770015, "Edited", "Reels (not a class)")], "Low", "\"Final 2\" implies an earlier Final that is not in Drive. \"Italian Vegan Cooking Class.mp4\" (2022) is a different class."],
  ["Vegan Italian Desserts", f("Italian Vegan Desserts.mov", "1Da91LQsuhioi5AbKRJafFH97Arh38Fj2", 1970506199, "Recordings", "Raw"), [], "None", ""],
  ["Vegan Korean Fried Chicken Workshop", f("Vegan Korean Fried Chicken Workshop.mov", "1LwxxTNm4csTkUwmG4YcvxSSGgIq-sbus", 1211731964, "Recordings", "Raw"), [], "None", ""],
  ["Vegan Mediterranean Cooking Class", f("Vegan Mediterranean.mp4", "1B7E0v8kGqme1ScmvwmBVtOqVJVmMEcIV", 3464492519, "Recordings", "Raw"), [], "None", ""],
  ["Vegan Mexican Cooking", f("Vegan Mexican Cuisine.mp4", "1g0XVeRm4DHDPgPepW-K3_sGtDNc3qGbg", 1438771454, "Recordings", "Raw"), [], "Low", "Tacos, Salsas and Tortas are their own classes; this is the general Mexican class."],
  ["Vegan Mother's Day Cook-Along Brunch", f("Mother's Day Brunch.mp4", "1WhJH5n-HMT_IRahr0Lw417A6omZ5-vAi", 2080733503, "Recordings", "Raw"), [], "None", ""],
  ["Vegan Passover Prep-Along", f("Vegan Passover Prep-Along Final.mp4", "1ewzoqzOMKukInBxWwP2HuJgMYua70fI8", 3231315425, "Edited", "Final"), [f("Vegan Passover Prep-Along.mov", "1AJO5v7h3TTxgFnyZmbzeqnUjafTwvafN", 2074763592, "Recordings", "Raw")], "None", ""],
  ["Vegan Sandwich Hall of Fame Cooking Class", f("Vegan Sandwich Hall of Fame.mp4", "1TLIwCbPjjtosgUIPEB7yszqYCpwK0gwh", 3315500407, "Recordings", "Raw"), [], "None", ""],
  ["Vegan Shabbat Dinner", f("Vegan Shabbat Dinner.mov", "1DHeo7F4fUHhxtMIs6itHJNKJ8ULJ6Q2V", 1700552433, "Recordings", "Raw"), [], "None", ""],
  ["Vegan Soup Workshop", f("Soup's On.mov", "19JUEi3R3PzBtmPc2m2Ur_-DxtS_Pv4cH", 2105843823, "Recordings", "Raw"), [f("Soup's On (1781806906740).mov", "1J8rDxIAQ7xC54FhF-l0uCHYY2kWwAxMM", 2105843823, "Recordings", "Copy")], "Medium", "Recording is titled \"Soup's On\" (Feb 2026); confirm it is the Soup Workshop."],
  ["Vegan Thai Kitchen Adventures", f("Thai Kitchen Adventures Fix 1.mp4", "110NQtcTw7uLjO-BfheKNV5SG0XrNaOVq", 3058508008, "Edited", "Final"), [f("Vegan Thai kitchen adventures.mp4", "1CVbHZUPGENLsrFCx_f7Or29_VockmXXZ", 2335203340, "Recordings", "Raw")], "Low", "Edited file is named \"Fix 1\"; confirm it is the approved cut."],
  ["Vegan Thanksgiving Training Camp", f("20 Day Vegan Thanksgiving Recipes .mp4", "19pRNWaDKgrztboJ4Op9xs_V75M1MW1OW", 10964205231, "Recordings", "Raw (large)"), [f("2022 Thanksgiving Class.mp4", "1QLw5QL18vk7TONtMiVZkvXijldn0nllk", 2972272966, "Recordings", "Raw"), f("2021 Thanksgiving Vegan Cooking Class.mp4", "1emVLrrh2LcjBxHbtIJbGWErS8LolHdfa", 1513530186, "Recordings", "Raw"), f("2024 Private Thanksgiving Class.mov", "13yHvrM4pyXPWhZtoAiBGnWN91Q5saK32", 1374352984, "Recordings", "Raw (private class)")], "High", "\"Training Camp\" may be the 20-day recipe series (11 GB, Nov 2022) or a set of Thanksgiving classes (2021, 2022). The 2024 class is marked Private."],
  ["Vegan Turkish Cuisine", f("Turkish Vegan Cuisine Final.mp4", "1ehekXMA35-fc7-yGyugMDX8PJMKlPt3S", 2979268022, "Edited", "Final"), [f("Turkish Cuisine.mp4", "1nwBiHC2gc48a9EgaH0gE3-OW_BQ5dJOM", 2554792018, "Recordings", "Raw"), f("Turkish vegan cuisine.mp4", "1rdg3P_4vfDxj_eWWffLI7qKQt81naO_Q", 18050739945, "Recordings", "Raw (large)"), f("Turkish vegan cuisine (1782177025424).mp4", "1Y8Px3dctOF_NNY7u3Kts4F7EYdHQYIZC", 18050739945, "Recordings", "Copy")], "None", ""],
  ["Vegan Valentine's Treats", f("Valentine's Treats.mov", "1xyrmtGTh7E2cIahwq88ujlSbGVOq3PY3", 1505078387, "Recordings", "Raw"), [f("Vegan Valentines.mp4", "1JQN7WaSegL_W4zZuOeBex_0cKVzW1RFD", 3395080542, "Recordings", "Raw")], "Medium", "Two Valentine's classes: \"Valentine's Treats\" (Feb 2025, name matches) and \"Vegan Valentines\" (Feb 2022). Confirm which the class page uses."],
  ["Veganized Chinese Takeout Classics", f("american chinese food class.mp4", "1lylGVLQKOkme8cBDFHo_NkYuL0JbcTeq", 3000734655, "Recordings", "Raw"), [], "Medium", "Only Chinese-food recording (Sept 2022), named \"american chinese food class\". Confirm."],
];

/** Recordings in the library that belong to none of the 51 classes. */
const OUTSIDE = [
  ["Supreme Mexican Tortas.mov", "1ZPESlsPI5MHD_ZTohJuD3saX0Ww1d81t", 1490283473, "In the site catalog as \"Supreme Vegan Mexican Tortas\" (not one of the 51). Sept 2026."],
  ["Korean BBQ Seitan.mov", "1EfaUuJEEjhn9Fo85S6aViMtPSnAX7pTr", 1236766259, "May 2026 class; not in the 51 or the catalog. Older \"OLD DECOMISSIONED Korean BBQ Seitan.mp4\" (2022) is retired."],
  ["Vegan James Beard.mp4", "1mVE2Sg-YhqvlLjl4QsJeZAkcf9V_V3-N", 3057364283, "Aug 2022 class; no matching title in the 51."],
  ["Japanese Bento Box Workshop With Marisa Baggett.mov", "19TZRKJKwAaZB2THr16NPDhqgrXU9UO71", 3389030906, "Mar 2025 guest workshop, plus \"Japanese Bento Workshop.mov\" and \"Bento Class EG.mov\"; not in the 51."],
  ["Italian Vegan Cooking Class.mp4", "1HK3uYsD6ixzTPrCnvB0hWegXWixAQAI6", 812669344, "Jan 2022; not in the 51."],
  ["Super Bowl Vegan Snack Attack.mp4", "1Hsr9SlIhIFoef4FBbUX6bcUq3iQ_RZaT", 3059175505, "Feb 2022; not in the 51."],
  ["Killer Vegan Brunch.mp4 / Brunch in 45 mins.mp4", "1WffrKBmiyuzyC5vL1hXx7mzPJBUdLKS5", 2146745501, "2021 and 2022 brunch classes; not in the 51."],
  ["Supreme vegan donut making bonanza.mp4", "1wskR-5n6T4G8cZI0FHd2BEZZoxSpxF53", 1726012965, "2022; not in the 51."],
  ["Fantastic Creations With Artisan Vegan Cheese.mp4", "1OoEPn_IK67EtQMaIUF-ydWm8Z9gAQ8KO", 1364573699, "Jan 2023; not in the 51."],
  ["Veganuary26 folders", "", 0, "Veganuary challenge content (Pantry Essentials, gear video, raw clips). Excluded as challenge material."],
  ["MN Rough Walkthrough.mp4 / Vegan University.mp4 / promo clips", "", 0, "Mighty walkthrough and promo videos. Not classes."],
];

export { MAP, OUTSIDE };

// Imported (by the migration script) → data only. Run directly → write the .csv and .md.
const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) writeReports();

function writeReports() {
const cell = (value) => `"${String(value).replace(/"/g, '""')}"`;
const versionsOf = (rec, others) => [rec, ...others].map((x) => `${x.version}: ${x.name} (${GB(x.bytes)} GB, ${x.folder})`).join(" | ");

const csv = [["#", "Class", "Recommended file", "Drive file ID", "Folder", "Version", "Size (GB)", "All versions found", "Ambiguity", "Notes"]];
MAP.forEach(([title, rec, others, risk, note], index) => {
  csv.push([index + 1, title, rec.name, rec.id, rec.folder, rec.version, GB(rec.bytes), versionsOf(rec, others), risk, note]);
});
writeFileSync(join(here, "class-video-mapping.csv"), csv.map((r) => r.map(cell).join(",")).join("\n") + "\n");

const total = MAP.reduce((sum, [, rec]) => sum + rec.bytes, 0);
const byRisk = MAP.reduce((acc, [, , , risk]) => ({ ...acc, [risk]: (acc[risk] ?? 0) + 1 }), {});
const md = [
  "# Class → video mapping (Drive)",
  "",
  "Read-only inventory of Google Drive (adam@cinnamonsnail.com) → `Cooking Classes`, taken 2026-10-08. Nothing was downloaded, moved, uploaded or changed. Generated by `docs/migration/class-video-mapping.mjs`; the same rows are in `class-video-mapping.csv`.",
  "",
  `- **51 of 51** classes have a recording in Drive. Recommended files total **${(total / 1e9).toFixed(1)} GB**.`,
  `- Ambiguity: ${["None", "Low", "Medium", "High"].map((k) => `${k} ${byRisk[k] ?? 0}`).join(" · ")}.`,
  "- **Recordings** = `Cooking Classes/Cooking Class Recordings`; **Edited** = `Cooking Classes/Edited Cooking Class Recordings`. An older second `Cooking Classes` tree holds duplicates (same names and sizes, other IDs) and is not used.",
  "- Rule used: the edited **Final** when one exists, else the **Compressed** export of an oversized master, else the single **Raw** recording. Migrate by **file ID**, since some names repeat.",
  "",
  "| # | Class | Recommended file | Version | Size | Other versions | Ambiguity | Notes |",
  "|---|---|---|---|---|---|---|---|",
  ...MAP.map(([title, rec, others, risk, note], index) =>
    `| ${index + 1} | ${title} | ${rec.name} | ${rec.version} | ${GB(rec.bytes)} GB | ${others.map((x) => `${x.name} (${x.version}, ${GB(x.bytes)} GB)`).join("<br>") || "—"} | **${risk}** | ${note || ""} |`,
  ),
  "",
  "## Needs a decision before migrating",
  "",
  ...MAP.filter(([, , , risk]) => risk === "High" || risk === "Medium").map(([title, , , risk, note]) => `- **${title}** (${risk}): ${note}`),
  "",
  "## In the library but not one of the 51 classes",
  "",
  ...OUTSIDE.map(([name, , bytes, note]) => `- \`${name}\`${bytes ? ` (${GB(bytes)} GB)` : ""}: ${note}`),
  "",
];
writeFileSync(join(here, "class-video-mapping.md"), md.join("\n"));
console.log(`${MAP.length} classes · ${(total / 1e9).toFixed(1)} GB recommended ·`, byRisk);
}

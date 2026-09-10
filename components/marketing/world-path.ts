/**
 * A very simplified world landmass silhouette in a 100x100 equirectangular
 * box (longitude -180..180 → x 0..100, latitude 90..-90 → y 0..100).
 *
 * This is a backdrop for the density glow, not a cartographic reference: it
 * exists so the dots read as places rather than floating in a void. Kept as a
 * hand-simplified path to avoid shipping a map library or a topojson payload
 * for one decorative panel.
 */
export const WORLD_LANDMASS_PATH = [
  // North America
  "M13 24 L20 20 L28 21 L31 25 L28 31 L24 34 L21 41 L18 37 L15 31 Z",
  // Central America
  "M22 43 L26 44 L28 48 L25 47 L22 45 Z",
  // South America
  "M27 50 L32 49 L35 54 L34 62 L31 70 L28 74 L26 68 L26 58 Z",
  // Greenland
  "M36 15 L42 14 L44 18 L40 22 L36 19 Z",
  // Europe
  "M47 22 L54 20 L57 23 L55 28 L50 30 L47 27 Z",
  // Africa
  "M47 33 L55 32 L58 37 L57 46 L53 56 L49 60 L46 52 L45 41 Z",
  // Middle East / West Asia
  "M58 30 L64 29 L66 33 L62 37 L58 35 Z",
  // Russia / North Asia
  "M57 17 L75 15 L86 18 L88 23 L80 26 L68 25 L59 22 Z",
  // South Asia
  "M66 38 L71 37 L73 42 L69 46 L66 42 Z",
  // East Asia
  "M74 28 L82 27 L85 32 L81 37 L75 34 Z",
  // Southeast Asia
  "M76 41 L82 40 L84 44 L79 47 L76 45 Z",
  // Australia
  "M82 57 L89 56 L92 61 L88 66 L83 64 L81 60 Z",
  // New Zealand
  "M93 67 L95 66 L96 70 L94 71 Z",
].join(" ");

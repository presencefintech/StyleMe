/**
 * Identité visuelle de StyleMe : un cintre (l'habillage) et un point citron (l'épingle du couturier).
 * Source unique du dessin : le logo de l'app, le favicon (app/icon.svg) et les icônes de l'app installable l'utilisent.
 * Toutes les coordonnées sont dans un carré de 100 x 100.
 */
export const BRAND = {
  /** Fond de l'icône (encre) et trait du cintre (papier). Le logo dans l'app prend les couleurs du thème. */
  tile: "#0B0B0C",
  paper: "#F6F6F3",
  /** Citron : même teinte que --accent du thème. */
  accent: "#CCF22E",
  /** Crochet du cintre. */
  hook: "M50 40 V33 A8.5 8.5 0 1 1 58.5 41.5",
  /** Corps du cintre. */
  hanger: "M50 40 L21 63 A4 4 0 0 0 23.5 70.5 H76.5 A4 4 0 0 0 79 63 L50 40 Z",
  /** Point de couleur (épingle de couturier). */
  dot: { cx: 80, cy: 22, r: 8 },
  stroke: 7,
  /** Centre le dessin (cintre + point) dans le carré et l'agrandit un peu : sans cela il restait décalé en haut à droite. */
  fit: "translate(50 50) scale(1.1) translate(-52.5 -44)",
} as const;

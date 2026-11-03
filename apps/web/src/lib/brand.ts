/**
 * Identité visuelle de StyleMe : un cintre (l'habillage) et un point de terre cuite (le geste du couturier).
 * Source unique du dessin : le logo de l'app, le favicon (app/icon.svg) et les icônes de l'app installable l'utilisent.
 * Toutes les coordonnées sont dans un carré de 100 x 100.
 */
export const BRAND = {
  /** Fond de l'icône (encre) et trait du cintre (papier). Le logo dans l'app prend les couleurs du thème. */
  tile: "#1E1B16",
  paper: "#F4EEE4",
  /** Terre cuite : même teinte que --primary du thème clair. */
  terracotta: "#C9552F",
  /** Crochet du cintre. */
  hook: "M50 40 V33 A8.5 8.5 0 1 1 58.5 41.5",
  /** Corps du cintre. */
  hanger: "M50 40 L21 63 A4 4 0 0 0 23.5 70.5 H76.5 A4 4 0 0 0 79 63 L50 40 Z",
  /** Point de couleur (épingle de couturier). */
  dot: { cx: 80, cy: 22, r: 7 },
  stroke: 7,
} as const;

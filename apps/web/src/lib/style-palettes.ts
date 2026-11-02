/**
 * Couleurs des fonds d'occasion, pour l'aperçu des cartes de style.
 * Doit rester aligné avec TEMPLATE_BACKGROUNDS dans services/ai/app/ops.py (même id, même dégradé haut → bas).
 */
export const STYLE_GRADIENTS: Record<string, [string, string]> = {
  mariage: ["#FDF3F0", "#E8C4BC"],
  anniversaire: ["#FFD36E", "#FF6B6B"],
  bapteme: ["#E8F3FF", "#BFD9F2"],
  diplome: ["#1F3A68", "#0E1B38"],
  fetes: ["#0B3D2E", "#8B1E2D"],
  "saint-valentin": ["#FF9EB5", "#C2185B"],
  "pro-linkedin": ["#E9EEF5", "#AEB9CC"],
  cv: ["#F5F5F5", "#D9D9D9"],
  "fond-studio": ["#CFCFCF", "#8F8F8F"],
  "studio-blanc": ["#FFFFFF", "#EEF0F3"],
  "studio-gris": ["#E3E6EA", "#B9BFC8"],
  "studio-bleu": ["#DCEBFA", "#A9C7EA"],
  "studio-beige": ["#F6EDE0", "#E3D2B8"],
};

export function gradientCss(id: string): string | undefined {
  const g = STYLE_GRADIENTS[id];
  return g ? `linear-gradient(180deg, ${g[0]}, ${g[1]})` : undefined;
}

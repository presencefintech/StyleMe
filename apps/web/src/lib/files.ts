export function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

async function fetchImage(url: string, name: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return new File([blob], `${name}.${EXTENSIONS[blob.type] ?? "png"}`, { type: blob.type || "image/png" });
}

/**
 * Enregistre l'image en pleine résolution. L'attribut `download` est ignoré pour une URL d'un autre domaine
 * (stockage signé) : on récupère donc le fichier puis on le sauvegarde depuis une URL locale.
 * Si la récupération échoue (réseau, CORS), on ouvre l'image dans un onglet pour un enregistrement manuel.
 */
export async function saveImage(url: string, name = "styleme"): Promise<void> {
  try {
    const file = await fetchImage(url, name);
    const local = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = local;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(local), 10_000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

/** Le partage de fichiers (feuille de partage du téléphone : WhatsApp, etc.) est-il disponible ? */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false;
  return navigator.canShare({ files: [new File([], "x.png", { type: "image/png" })] });
}

/** Ouvre la feuille de partage du téléphone avec l'image. Retourne false si l'utilisateur annule. */
export async function shareImage(url: string, name = "styleme"): Promise<boolean> {
  const file = await fetchImage(url, name);
  try {
    await navigator.share({ files: [file], title: "Ma photo StyleMe" });
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return false;
    throw e;
  }
}

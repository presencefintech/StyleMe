import { mkdir, readFile, writeFile, access, copyFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { BACKGROUND_PRESETS, presetPrompt } from "../packages/shared/src/catalog";

/**
 * Compare les décors (BACKGROUND_PRESETS) côte à côte sur UNE photo de test, via Replicate.
 *
 *   tsx --env-file=.env scripts/compare-backgrounds.ts <photo> [--styles mariage,diplome] [--dry] [--out dossier]
 *
 * - Écrit une image par preset + une page `index.html` (photo d'origine à gauche, décors à droite).
 * - Les images déjà générées sont conservées : relancer ne repaie que ce qui manque.
 * - `--dry` affiche le nombre d'appels sans rien envoyer.
 * Chaque image est un appel facturé par Replicate (de l'ordre de quelques centimes) : commencer par `--styles`.
 * La photo est envoyée à Replicate : utiliser une photo de test dont on a le droit de se servir.
 */

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const CONCURRENCY = 3;
const POLL_MS = 2000;
const MAX_WAIT_MS = 180_000;

interface Prediction { status: string; output?: string | string[]; error?: string; urls?: { get?: string } }

async function generate(token: string, model: string, imageDataUri: string, prompt: string): Promise<Uint8Array> {
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: "POST",
    headers: { ...headers, prefer: "wait" },
    body: JSON.stringify({ input: { prompt, input_image: imageDataUri, output_format: "png" } }),
  });
  if (!res.ok) throw new Error(`Replicate ${res.status}`);
  let p = (await res.json()) as Prediction;
  const deadline = Date.now() + MAX_WAIT_MS;
  while ((p.status === "starting" || p.status === "processing") && p.urls?.get) {
    if (Date.now() > deadline) throw new Error("délai dépassé");
    await new Promise((r) => setTimeout(r, POLL_MS));
    const poll = await fetch(p.urls.get, { headers });
    if (!poll.ok) throw new Error(`Replicate (suivi) ${poll.status}`);
    p = (await poll.json()) as Prediction;
  }
  const out = Array.isArray(p.output) ? p.output[0] : p.output;
  if (p.status !== "succeeded" || !out) throw new Error(`${p.status}: ${p.error ?? "pas de résultat"}`);
  const img = await fetch(out);
  if (!img.ok) throw new Error(`téléchargement ${img.status}`);
  return new Uint8Array(await img.arrayBuffer());
}

const exists = (p: string) => access(p).then(() => true, () => false);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.includes(name);
  const value = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const photoPath = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--styles" && args[i - 1] !== "--out");
  if (!photoPath) throw new Error("Usage : tsx --env-file=.env scripts/compare-backgrounds.ts <photo> [--styles a,b] [--dry] [--out dossier]");

  const wanted = value("--styles")?.split(",").map((s) => s.trim()).filter(Boolean) ?? Object.keys(BACKGROUND_PRESETS);
  const unknown = wanted.filter((s) => !BACKGROUND_PRESETS[s]);
  if (unknown.length) throw new Error(`Occasions inconnues : ${unknown.join(", ")} (disponibles : ${Object.keys(BACKGROUND_PRESETS).join(", ")})`);

  const jobs = wanted.flatMap((style) => BACKGROUND_PRESETS[style]!.map((preset) => ({ style, preset })));
  console.log(`${jobs.length} image(s) à produire pour : ${wanted.join(", ")}`);
  if (flag("--dry")) return;

  const token = process.env.REPLICATE_TOKEN;
  if (!token) throw new Error("REPLICATE_TOKEN est requis (--env-file=.env)");
  const model = process.env.REPLICATE_EDIT_MODEL ?? "black-forest-labs/flux-kontext-pro";

  const out = resolve(value("--out") ?? "scripts/.out/compare-backgrounds");
  await mkdir(out, { recursive: true });
  const ext = extname(photoPath).toLowerCase();
  const mime = MIME[ext];
  if (!mime) throw new Error("Format de photo non supporté (jpg, png, webp)");
  const original = `original${ext}`;
  await copyFile(photoPath, join(out, original));
  const dataUri = `data:${mime};base64,${(await readFile(photoPath)).toString("base64")}`;

  let done = 0;
  const failures: string[] = [];
  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const file = join(out, `${job.style}__${job.preset.id}.png`);
        const label = `${job.style}/${job.preset.id}`;
        if (await exists(file)) { console.log(`déjà fait   ${label}`); continue; }
        try {
          await writeFile(file, await generate(token, model, dataUri, presetPrompt(job.preset)));
          console.log(`[${++done}] ok     ${label}`);
        } catch (e) {
          failures.push(label);
          console.error(`ÉCHEC      ${label} : ${e instanceof Error ? e.message : e}`);
        }
      }
    }),
  );

  const rows = wanted.map((style) => {
    const cells = BACKGROUND_PRESETS[style]!.map((p, i) => {
      const f = `${style}__${p.id}.png`;
      return `<figure><img src="${esc(f)}" alt="${esc(p.label)}" onerror="this.replaceWith(Object.assign(document.createElement('p'),{textContent:'(échec)'}))"><figcaption>${i === 0 ? "★ défaut · " : ""}${esc(p.label)} <code>${esc(p.id)}</code></figcaption></figure>`;
    }).join("");
    return `<section><h2>${esc(style)}</h2><div class="row"><figure><img src="${esc(original)}" alt="Original"><figcaption>Original</figcaption></figure>${cells}</div></section>`;
  }).join("\n");
  await writeFile(
    join(out, "index.html"),
    `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Comparaison des décors</title>
<style>body{font:14px system-ui;margin:24px;background:#faf7f2;color:#1b1a2e}h2{margin:28px 0 8px}.row{display:flex;gap:12px;overflow-x:auto}figure{margin:0;flex:0 0 260px}img{width:260px;border-radius:12px;display:block}figcaption{margin-top:6px}code{color:#6b6a80}</style>
<h1>Comparaison des décors</h1><p>★ = décor utilisé en production. Pour en changer, placer le gagnant en premier dans <code>BACKGROUND_PRESETS</code> (packages/shared/src/catalog.ts).</p>
${rows}</html>`,
  );
  console.log(`\nOuvrir : ${join(out, "index.html")}`);
  if (failures.length) { console.error(`${failures.length} échec(s) : ${failures.join(", ")}`); process.exitCode = 1; }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

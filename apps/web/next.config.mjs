/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@styleme/shared"],
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true }, // lint géré à la racine (npm run lint)
  async headers() {
    return [
      // Le service worker ne doit jamais rester en cache : sinon une mise à jour n'atteint pas les téléphones.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
      { source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "X-Frame-Options", value: "DENY" },
    ] },
    ];
  },
};
export default nextConfig;

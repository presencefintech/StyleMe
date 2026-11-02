/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@styleme/shared"],
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true }, // lint géré à la racine (npm run lint)
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "X-Frame-Options", value: "DENY" },
    ] }];
  },
};
export default nextConfig;

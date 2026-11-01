/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  transpilePackages: ["@eziokwu/shared"],
  // Dev only: allow the quick-tunnel hostnames used to test the Mini App inside Telegram.
  allowedDevOrigins: ["*.trycloudflare.com"],
  // Telegram Mini Apps are loaded in an iframe/webview by telegram.org clients only.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    // wagmi's connector barrel imports Coinbase/Base connectors whose optional deps we don't use.
    config.resolve.alias = { ...config.resolve.alias, "@x402/evm": false, "@x402/core": false, "@x402/fetch": false, "@x402/svm": false, "@react-native-async-storage/async-storage": false };
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
};

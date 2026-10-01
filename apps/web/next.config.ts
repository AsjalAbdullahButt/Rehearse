import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// No nonces: this is a BFF architecture (see AGENTS.md) where every browser fetch to the API
// goes through same-origin /api/* route handlers, not directly cross-origin, so there's no
// third-party script/style surface to lock down with per-request nonces — see Next's own CSP
// guide (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md), which
// recommends this same static-header approach (and its 'unsafe-inline' fallback) for apps that
// don't need nonce-based CSP. 'unsafe-inline' on both script-src and style-src is required
// either way: Next's own inline hydration script needs it for script-src, and the `motion`
// library's heavy use of inline `style={{...}}` for animation needs it for style-src.
const cspDirectives = [
  "default-src 'self'",
  // 'wasm-unsafe-eval' only lets WebAssembly modules compile (the optional camera coach's
  // on-device face model); it does not enable eval() of JavaScript.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: cspDirectives.join("; ") },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Superseded by frame-ancestors in modern browsers, kept for older ones.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The app itself needs the mic (interview recording) and, for the optional camera
          // coach only, the camera — both from its own origin and never from an embedded frame.
          // Nothing needs the user's location.
          {
            key: "Permissions-Policy",
            value: "camera=(self), geolocation=(), microphone=(self)",
          },
          ...(isDev
            ? []
            : [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
              ]),
        ],
      },
    ];
  },
};

export default nextConfig;

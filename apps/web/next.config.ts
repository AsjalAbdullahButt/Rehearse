import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Superseded by frame-ancestors in modern browsers, kept for older ones.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The app itself needs the mic (interview recording) and, for the optional camera
          // coach only, the camera: both from its own origin and never from an embedded frame.
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

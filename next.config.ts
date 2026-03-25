import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Link",
            value: [
              "<https://fonts.googleapis.com>; rel=preconnect",
              "<https://fonts.gstatic.com>; rel=preconnect; crossorigin",
              "<https://zvfwgwmflxfjghlyxdak.supabase.co>; rel=preconnect",
            ].join(", "),
          },
        ],
      },
    ];
  },

  images: {
    formats: ["image/webp", "image/avif"],
  },

  compress: true,
};

export default nextConfig;
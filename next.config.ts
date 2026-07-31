import type { NextConfig } from "next";

const contentSecurityPolicy = [
	"default-src 'self'",
	"base-uri 'self'",
	"object-src 'none'",
	"form-action 'self'",
	"frame-ancestors 'self'",
	"frame-src 'self'",
	"script-src 'self' 'unsafe-inline'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob: https:",
	"font-src 'self' data:",
	"connect-src 'self'",
	"media-src 'self' blob:",
	"manifest-src 'self'",
	"upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
	{ key: "Content-Security-Policy", value: contentSecurityPolicy },
	{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
	{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
	{ key: "X-Content-Type-Options", value: "nosniff" },
	{ key: "X-Frame-Options", value: "SAMEORIGIN" },
	{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
	poweredByHeader: false,
	allowedDevOrigins: ["lauchgruen.localhost", "tournament.lauchgruen.localhost"],
	experimental: {
		turbopackFileSystemCacheForDev: false,
	},
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "static-cdn.jtvnw.net",
			},
			{
				protocol: "https",
				hostname: "cdn.discordapp.com",
			},
			{
				protocol: "https",
				hostname: "ddragon.leagueoflegends.com",
			},
		],
	},
	async headers() {
		if (process.env.NODE_ENV !== "production") return [];

		return [
			{
				source: "/:path*",
				headers: securityHeaders,
			},
		];
	},
};

export default nextConfig;

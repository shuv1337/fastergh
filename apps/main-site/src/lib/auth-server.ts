import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

export const {
	handler,
	preloadAuthQuery,
	isAuthenticated,
	getToken,
	fetchAuthQuery,
	fetchAuthMutation,
	fetchAuthAction,
} = convexBetterAuthNextJs({
	convexUrl: process.env.CONVEX_URL ?? "",
	convexSiteUrl: process.env.CONVEX_SITE_URL ?? "",
});

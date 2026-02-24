import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

// Public production defaults — same values are shipped in the client bundle.
const CONVEX_URL =
	process.env.CONVEX_URL ?? "https://descriptive-caiman-974.convex.cloud";
const CONVEX_SITE_URL =
	process.env.CONVEX_SITE_URL ?? "https://descriptive-caiman-974.convex.site";

const convexBetterAuth = convexBetterAuthNextJs({
	convexUrl: CONVEX_URL,
	convexSiteUrl: CONVEX_SITE_URL,
});

const convexSiteHost = new URL(CONVEX_SITE_URL).host;

const forwardAuthRequest = (request: Request) => {
	const requestUrl = new URL(request.url);
	const convexAuthUrl = `${CONVEX_SITE_URL}${requestUrl.pathname}${requestUrl.search}`;
	const proxiedRequest = new Request(convexAuthUrl, request);

	proxiedRequest.headers.set("accept-encoding", "application/json");
	proxiedRequest.headers.set("host", convexSiteHost);
	proxiedRequest.headers.set("x-forwarded-host", requestUrl.host);
	proxiedRequest.headers.set(
		"x-forwarded-proto",
		requestUrl.protocol.replace(":", ""),
	);

	return fetch(proxiedRequest, {
		method: request.method,
		redirect: "manual",
	});
};

export const handler = {
	GET: forwardAuthRequest,
	POST: forwardAuthRequest,
};

export const {
	preloadAuthQuery,
	isAuthenticated,
	getToken,
	fetchAuthQuery,
	fetchAuthMutation,
	fetchAuthAction,
} = convexBetterAuth;

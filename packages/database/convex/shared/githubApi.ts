import * as HttpClient from "@effect/platform/HttpClient";
import * as HttpClientError from "@effect/platform/HttpClientError";
import * as HttpClientRequest from "@effect/platform/HttpClientRequest";
import * as HttpClientResponse from "@effect/platform/HttpClientResponse";
import { Context, Data, Effect, Layer } from "effect";
import {
	type GitHubClient,
	make as makeGeneratedClient,
} from "./generated_github_client";
import { getInstallationToken } from "./githubApp";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class GitHubApiError extends Data.TaggedError("GitHubApiError")<{
	readonly status: number;
	readonly message: string;
	readonly url: string;
}> {}

/**
 * Thrown when GitHub returns a rate limit response (429 or 403 with
 * rate-limit headers). Includes the `retryAfterMs` hint from the
 * `Retry-After` / `X-RateLimit-Reset` headers so callers can back off.
 */
export class GitHubRateLimitError extends Data.TaggedError(
	"GitHubRateLimitError",
)<{
	readonly status: number;
	readonly message: string;
	readonly url: string;
	readonly retryAfterMs: number;
}> {}

// ---------------------------------------------------------------------------
// Rate-limit detection helpers
// ---------------------------------------------------------------------------

const parseRetryAfterMs = (headers: Headers): number => {
	const retryAfter = headers.get("Retry-After");
	if (retryAfter) {
		const secs = Number(retryAfter);
		if (!Number.isNaN(secs) && secs > 0) return secs * 1_000;
	}

	const resetEpoch = headers.get("X-RateLimit-Reset");
	if (resetEpoch) {
		const resetMs = Number(resetEpoch) * 1_000;
		const delta = resetMs - Date.now();
		if (delta > 0) return delta;
	}

	return 60_000;
};

const isRateLimitResponse = (status: number, headers: Headers): boolean => {
	if (status === 429) return true;
	if (status === 403) {
		const remaining = headers.get("X-RateLimit-Remaining");
		if (remaining === "0") return true;
	}
	return false;
};

// ---------------------------------------------------------------------------
// GitHub API Client
// ---------------------------------------------------------------------------

const BASE_URL = "https://api.github.com";

type IGitHubApiClient = Readonly<{
	/**
	 * The fully typed GitHub API client generated from the OpenAPI spec.
	 * Each method returns a typed `Effect` with proper request/response types.
	 *
	 * Usage:
	 * ```ts
	 * const gh = yield* GitHubApiClient;
	 * const pr = yield* gh.client.pullsGet(owner, repo, String(number));
	 * ```
	 */
	client: GitHubClient;

	/**
	 * The underlying `@effect/platform` HttpClient with auth headers baked in.
	 * Useful for endpoints that need custom Accept headers (e.g. diff format).
	 */
	httpClient: HttpClient.HttpClient;
}>;

// ---------------------------------------------------------------------------
// Client implementation
// ---------------------------------------------------------------------------

/**
 * Build an `@effect/platform` HttpClient backed by the global `fetch`,
 * with GitHub auth headers, base URL, and rate-limit detection baked in.
 *
 * We use `HttpClient.mapRequest` to rewrite relative paths to absolute
 * URLs BEFORE the platform's internal `UrlParams.makeUrl` tries to parse
 * the request URL. Without this, `new URL("/repos/...", undefined)` throws
 * in runtimes that lack `globalThis.location` (like Convex).
 */
const makeAuthedHttpClient = (token: string): HttpClient.HttpClient =>
	HttpClient.mapRequest(
		HttpClient.make((request, url, signal, _fiber) =>
			Effect.gen(function* () {
				// Convert HttpClientRequest body to a BodyInit for native fetch.
				// bodyUnsafeJson produces a Uint8Array body (JSON.stringify → TextEncoder.encode).
				// Raw bodies may also appear from manual request construction.
				let body: string | undefined;
				if (
					request.body._tag === "Uint8Array" &&
					request.body.body !== undefined
				) {
					body = new TextDecoder().decode(request.body.body);
				} else if (
					request.body._tag === "Raw" &&
					request.body.body !== undefined
				) {
					body = String(request.body.body);
				}

				// Merge auth headers with any request-specific headers.
				// Effect Headers is a branded record — extract entries to merge cleanly.
				const requestHeaders = Object.fromEntries(
					Object.entries(request.headers),
				);
				const mergedHeaders: Record<string, string> = {
					Authorization: `Bearer ${token}`,
					Accept: "application/vnd.github+json",
					"X-GitHub-Api-Version": "2022-11-28",
					// bodyUnsafeJson sets the body as raw pre-serialized JSON but
					// doesn't add Content-Type since we bypass the platform layer.
					...(body !== undefined ? { "Content-Type": "application/json" } : {}),
					...requestHeaders,
				};

				const res = yield* Effect.tryPromise({
					try: () =>
						fetch(url.href, {
							method: request.method,
							headers: mergedHeaders,
							body,
							signal,
						}),
					catch: (cause) =>
						new HttpClientError.RequestError({
							request,
							reason: "Transport",
							description: String(cause),
						}),
				});

				// Detect rate limits at the transport layer.
				// We surface these as HttpClientError.ResponseError so the type
				// fits HttpClient's error channel. Callers can catchTag on it.
				if (isRateLimitResponse(res.status, res.headers)) {
					return yield* new HttpClientError.ResponseError({
						request,
						response: HttpClientResponse.fromWeb(request, res),
						reason: "StatusCode",
						description: `GitHub rate limit hit (${res.status}). Retry after ${Math.round(parseRetryAfterMs(res.headers) / 1_000)}s.`,
					});
				}

				return HttpClientResponse.fromWeb(request, res);
			}).pipe(Effect.withSpan("github_api.request")),
		),
		(request) => {
			// Prepend base URL to relative paths so the platform's URL parser
			// receives an absolute URL it can parse without a base.
			const url = request.url;
			if (typeof url === "string" && url.startsWith("/")) {
				return HttpClientRequest.setUrl(request, `${BASE_URL}${url}`);
			}
			return request;
		},
	);

const makeClient = (token: string): IGitHubApiClient => {
	const httpClient = makeAuthedHttpClient(token);
	const typedClient = makeGeneratedClient(httpClient);
	return { client: typedClient, httpClient };
};

export class GitHubApiClient extends Context.Tag("@quickhub/GitHubApiClient")<
	GitHubApiClient,
	IGitHubApiClient
>() {
	/**
	 * Construct a client layer from an explicit OAuth token string.
	 */
	static fromToken = (token: string) => Layer.succeed(this, makeClient(token));

	/**
	 * Construct a client layer from a GitHub App installation ID.
	 */
	static fromInstallation = (installationId: number) =>
		Layer.effect(
			this,
			Effect.gen(function* () {
				const token = yield* getInstallationToken(installationId);
				return makeClient(token);
			}),
		);
}

export type { GitHubClient, IGitHubApiClient };

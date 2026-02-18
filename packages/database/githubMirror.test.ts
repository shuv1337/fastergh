/**
 * Integration tests for the GitHub mirror pipeline.
 *
 * Tests webhook processing, projection correctness, idempotency,
 * and out-of-order event handling using @packages/convex-test.
 *
 * Uses @effect/vitest for Effect-based test runner.
 * Confect functions return ExitEncoded ({ _tag: "Success", value } or { _tag: "Failure", cause }).
 * We use t.run() for direct DB seeding/verification and t.mutation()/t.query()
 * for calling Confect-wrapped functions.
 */

import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { api, internal } from "./convex/_generated/api";
import { createConvexTest } from "./testing";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ExitEncoded = { _tag: string; value?: unknown; cause?: unknown };

const assertSuccess = (result: unknown): unknown => {
	const exit = result as ExitEncoded;
	if (exit._tag !== "Success") {
		throw new Error(
			`Expected Success, got ${exit._tag}: ${JSON.stringify(exit.cause)}`,
		);
	}
	return exit.value;
};

/** Build a minimal raw webhook event payload for seeding */
const makeRawEvent = (overrides: {
	deliveryId: string;
	eventName: string;
	action?: string;
	repositoryId: number;
	payloadJson: string;
	processState?: "pending" | "processed" | "failed";
}) => ({
	deliveryId: overrides.deliveryId,
	eventName: overrides.eventName,
	action: overrides.action ?? null,
	installationId: 0,
	repositoryId: overrides.repositoryId,
	signatureValid: true,
	payloadJson: overrides.payloadJson,
	receivedAt: Date.now(),
	processState: overrides.processState ?? "pending",
	processError: null,
});

/** Build a minimal GitHub issue webhook payload */
const makeIssuePayload = (opts: {
	action: string;
	issueId: number;
	number: number;
	state: "open" | "closed";
	title: string;
	body?: string;
	updated_at?: string;
	user?: { id: number; login: string; avatar_url?: string; type?: string };
}) =>
	JSON.stringify({
		action: opts.action,
		issue: {
			id: opts.issueId,
			number: opts.number,
			state: opts.state,
			title: opts.title,
			body: opts.body ?? null,
			user: opts.user ?? {
				id: 1001,
				login: "testuser",
				avatar_url: null,
				type: "User",
			},
			labels: [],
			assignees: [],
			comments: 0,
			updated_at: opts.updated_at ?? "2026-02-18T10:00:00Z",
		},
		sender: opts.user ?? {
			id: 1001,
			login: "testuser",
			avatar_url: null,
			type: "User",
		},
	});

/** Build a minimal GitHub pull_request webhook payload */
const makePrPayload = (opts: {
	action: string;
	prId: number;
	number: number;
	state: "open" | "closed";
	title: string;
	draft?: boolean;
	headRef?: string;
	baseRef?: string;
	headSha?: string;
	updated_at?: string;
	user?: { id: number; login: string; avatar_url?: string; type?: string };
}) =>
	JSON.stringify({
		action: opts.action,
		pull_request: {
			id: opts.prId,
			number: opts.number,
			state: opts.state,
			draft: opts.draft ?? false,
			title: opts.title,
			body: null,
			user: opts.user ?? {
				id: 1001,
				login: "testuser",
				avatar_url: null,
				type: "User",
			},
			head: {
				ref: opts.headRef ?? "feature-branch",
				sha: opts.headSha ?? "abc123",
			},
			base: { ref: opts.baseRef ?? "main" },
			assignees: [],
			requested_reviewers: [],
			mergeable_state: null,
			merged_at: null,
			closed_at: null,
			updated_at: opts.updated_at ?? "2026-02-18T10:00:00Z",
		},
		sender: opts.user ?? {
			id: 1001,
			login: "testuser",
			avatar_url: null,
			type: "User",
		},
	});

/** Build a minimal push event payload */
const makePushPayload = (opts: {
	ref: string;
	after: string;
	commits?: Array<{ id: string; message: string; timestamp: string }>;
	deleted?: boolean;
}) =>
	JSON.stringify({
		ref: opts.ref,
		after: opts.after,
		deleted: opts.deleted ?? false,
		commits: opts.commits ?? [],
		sender: { id: 1001, login: "testuser", avatar_url: null, type: "User" },
	});

/** Seed a repository in the DB so webhook processing can find it */
const seedRepository = (
	t: ReturnType<typeof createConvexTest>,
	repositoryId: number,
	ownerLogin = "testowner",
	name = "testrepo",
) =>
	Effect.promise(() =>
		t.run(async (ctx) => {
			await ctx.db.insert("github_repositories", {
				githubRepoId: repositoryId,
				installationId: 0,
				ownerId: 100,
				ownerLogin,
				name,
				fullName: `${ownerLogin}/${name}`,
				private: false,
				visibility: "public",
				defaultBranch: "main",
				archived: false,
				disabled: false,
				fork: false,
				pushedAt: null,
				githubUpdatedAt: Date.now(),
				cachedAt: Date.now(),
			});
		}),
	);

/** Insert a raw webhook event into the DB */
const insertRawEvent = (
	t: ReturnType<typeof createConvexTest>,
	event: ReturnType<typeof makeRawEvent>,
) =>
	Effect.promise(() =>
		t.run(async (ctx) => {
			await ctx.db.insert("github_webhook_events_raw", event);
		}),
	);

/** Process a webhook event by deliveryId */
const processEvent = (
	t: ReturnType<typeof createConvexTest>,
	deliveryId: string,
) =>
	Effect.promise(() =>
		t.mutation(internal.rpc.webhookProcessor.processWebhookEvent, {
			deliveryId,
		}),
	);

/** Query a table and return all docs */
const collectTable = <T>(
	t: ReturnType<typeof createConvexTest>,
	tableName: string,
) =>
	Effect.promise(
		() =>
			t.run(async (ctx) => {
				return (
					ctx.db.query(tableName) as ReturnType<typeof ctx.db.query>
				).collect();
			}) as Promise<Array<T>>,
	);

// ---------------------------------------------------------------------------
// Webhook Processing Tests
// ---------------------------------------------------------------------------

describe("Webhook Processing", () => {
	it.effect("processes an issue opened event", () =>
		Effect.gen(function* () {
			const t = createConvexTest();
			const repositoryId = 12345;
			yield* seedRepository(t, repositoryId);

			yield* insertRawEvent(
				t,
				makeRawEvent({
					deliveryId: "delivery-issue-1",
					eventName: "issues",
					action: "opened",
					repositoryId,
					payloadJson: makeIssuePayload({
						action: "opened",
						issueId: 5001,
						number: 1,
						state: "open",
						title: "Test issue",
						body: "This is a test issue body",
					}),
				}),
			);

			const result = yield* processEvent(t, "delivery-issue-1");
			const value = assertSuccess(result);
			expect(value).toMatchObject({
				processed: true,
				eventName: "issues",
				action: "opened",
			});

			// Verify the issue was inserted into domain table
			const issues = yield* collectTable(t, "github_issues");
			expect(issues).toHaveLength(1);
			expect(issues[0]).toMatchObject({
				repositoryId,
				githubIssueId: 5001,
				number: 1,
				state: "open",
				title: "Test issue",
				isPullRequest: false,
			});

			// Verify the user was upserted
			const users = yield* collectTable(t, "github_users");
			expect(users).toHaveLength(1);
			expect(users[0]).toMatchObject({
				githubUserId: 1001,
				login: "testuser",
			});

			// Verify the raw event was marked as processed
			const rawEvents = yield* collectTable(t, "github_webhook_events_raw");
			expect(rawEvents[0]).toMatchObject({
				processState: "processed",
			});
		}),
	);

	it.effect("processes a pull_request opened event", () =>
		Effect.gen(function* () {
			const t = createConvexTest();
			const repositoryId = 12345;
			yield* seedRepository(t, repositoryId);

			yield* insertRawEvent(
				t,
				makeRawEvent({
					deliveryId: "delivery-pr-1",
					eventName: "pull_request",
					action: "opened",
					repositoryId,
					payloadJson: makePrPayload({
						action: "opened",
						prId: 6001,
						number: 42,
						state: "open",
						title: "Add feature X",
						headRef: "feature-x",
						baseRef: "main",
						headSha: "sha-feature-x",
					}),
				}),
			);

			const result = yield* processEvent(t, "delivery-pr-1");
			assertSuccess(result);

			const prs = yield* collectTable(t, "github_pull_requests");
			expect(prs).toHaveLength(1);
			expect(prs[0]).toMatchObject({
				repositoryId,
				githubPrId: 6001,
				number: 42,
				state: "open",
				title: "Add feature X",
				headRefName: "feature-x",
				baseRefName: "main",
				headSha: "sha-feature-x",
			});
		}),
	);

	it.effect("processes a push event with commits", () =>
		Effect.gen(function* () {
			const t = createConvexTest();
			const repositoryId = 12345;
			yield* seedRepository(t, repositoryId);

			yield* insertRawEvent(
				t,
				makeRawEvent({
					deliveryId: "delivery-push-1",
					eventName: "push",
					action: null,
					repositoryId,
					payloadJson: makePushPayload({
						ref: "refs/heads/main",
						after: "sha-new-head",
						commits: [
							{
								id: "sha-commit-1",
								message: "First commit\n\nDetailed description",
								timestamp: "2026-02-18T10:00:00Z",
							},
							{
								id: "sha-commit-2",
								message: "Second commit",
								timestamp: "2026-02-18T10:01:00Z",
							},
						],
					}),
				}),
			);

			const result = yield* processEvent(t, "delivery-push-1");
			assertSuccess(result);

			const branches = yield* collectTable<{
				repositoryId: number;
				name: string;
				headSha: string;
			}>(t, "github_branches");
			expect(branches).toHaveLength(1);
			expect(branches[0]).toMatchObject({
				repositoryId,
				name: "main",
				headSha: "sha-new-head",
			});

			const commits = yield* collectTable<{
				sha: string;
				messageHeadline: string;
			}>(t, "github_commits");
			expect(commits).toHaveLength(2);
			expect(commits.map((c) => c.sha).sort()).toEqual(
				["sha-commit-1", "sha-commit-2"].sort(),
			);
			const firstCommit = commits.find((c) => c.sha === "sha-commit-1");
			expect(firstCommit?.messageHeadline).toBe("First commit");
		}),
	);

	it.effect("skips events without a repository", () =>
		Effect.gen(function* () {
			const t = createConvexTest();

			yield* Effect.promise(() =>
				t.run(async (ctx) => {
					await ctx.db.insert("github_webhook_events_raw", {
						deliveryId: "delivery-no-repo",
						eventName: "ping",
						action: null,
						installationId: 0,
						repositoryId: null,
						signatureValid: true,
						payloadJson: JSON.stringify({ zen: "test" }),
						receivedAt: Date.now(),
						processState: "pending",
						processError: null,
					});
				}),
			);

			const result = yield* processEvent(t, "delivery-no-repo");
			const value = assertSuccess(result);
			expect(value).toMatchObject({
				processed: true,
				eventName: "ping",
			});
		}),
	);

	it.effect("returns processed:false for nonexistent delivery", () =>
		Effect.gen(function* () {
			const t = createConvexTest();

			const result = yield* processEvent(t, "nonexistent");
			const value = assertSuccess(result);
			expect(value).toMatchObject({
				processed: false,
				eventName: "unknown",
			});
		}),
	);
});

// ---------------------------------------------------------------------------
// Idempotency Tests
// ---------------------------------------------------------------------------

describe("Idempotency", () => {
	it.effect("processing the same issue event twice produces one issue", () =>
		Effect.gen(function* () {
			const t = createConvexTest();
			const repositoryId = 12345;
			yield* seedRepository(t, repositoryId);

			yield* insertRawEvent(
				t,
				makeRawEvent({
					deliveryId: "delivery-idem-1",
					eventName: "issues",
					action: "opened",
					repositoryId,
					payloadJson: makeIssuePayload({
						action: "opened",
						issueId: 5001,
						number: 1,
						state: "open",
						title: "Idempotent issue",
					}),
				}),
			);

			yield* processEvent(t, "delivery-idem-1");

			// Reset processState to pending (simulating a replay)
			yield* Effect.promise(() =>
				t.run(async (ctx) => {
					const events = await ctx.db
						.query("github_webhook_events_raw")
						.collect();
					await ctx.db.patch(events[0]._id, { processState: "pending" });
				}),
			);

			yield* processEvent(t, "delivery-idem-1");

			const issues = yield* collectTable(t, "github_issues");
			expect(issues).toHaveLength(1);
			expect(issues[0]).toMatchObject({
				githubIssueId: 5001,
				number: 1,
				title: "Idempotent issue",
			});
		}),
	);

	it.effect("processing the same PR event twice produces one PR", () =>
		Effect.gen(function* () {
			const t = createConvexTest();
			const repositoryId = 12345;
			yield* seedRepository(t, repositoryId);

			yield* insertRawEvent(
				t,
				makeRawEvent({
					deliveryId: "delivery-idem-pr-1",
					eventName: "pull_request",
					action: "opened",
					repositoryId,
					payloadJson: makePrPayload({
						action: "opened",
						prId: 6001,
						number: 10,
						state: "open",
						title: "Idempotent PR",
					}),
				}),
			);

			yield* processEvent(t, "delivery-idem-pr-1");

			yield* Effect.promise(() =>
				t.run(async (ctx) => {
					const events = await ctx.db
						.query("github_webhook_events_raw")
						.collect();
					await ctx.db.patch(events[0]._id, { processState: "pending" });
				}),
			);

			yield* processEvent(t, "delivery-idem-pr-1");

			const prs = yield* collectTable(t, "github_pull_requests");
			expect(prs).toHaveLength(1);
		}),
	);
});

// ---------------------------------------------------------------------------
// Out-of-Order Handling Tests
// ---------------------------------------------------------------------------

describe("Out-of-Order Handling", () => {
	it.effect("newer issue update is not overwritten by older event", () =>
		Effect.gen(function* () {
			const t = createConvexTest();
			const repositoryId = 12345;
			yield* seedRepository(t, repositoryId);

			// First: process a NEWER event (closed at t+1)
			yield* insertRawEvent(
				t,
				makeRawEvent({
					deliveryId: "delivery-ooo-newer",
					eventName: "issues",
					action: "closed",
					repositoryId,
					payloadJson: makeIssuePayload({
						action: "closed",
						issueId: 5001,
						number: 1,
						state: "closed",
						title: "OOO Issue",
						updated_at: "2026-02-18T12:00:00Z",
					}),
				}),
			);

			yield* processEvent(t, "delivery-ooo-newer");

			let issues = yield* collectTable<{ state: string; title: string }>(
				t,
				"github_issues",
			);
			expect(issues[0]).toMatchObject({ state: "closed" });

			// Now: process an OLDER event (opened at t-1)
			yield* insertRawEvent(
				t,
				makeRawEvent({
					deliveryId: "delivery-ooo-older",
					eventName: "issues",
					action: "opened",
					repositoryId,
					payloadJson: makeIssuePayload({
						action: "opened",
						issueId: 5001,
						number: 1,
						state: "open",
						title: "OOO Issue (old version)",
						updated_at: "2026-02-18T10:00:00Z",
					}),
				}),
			);

			yield* processEvent(t, "delivery-ooo-older");

			issues = yield* collectTable(t, "github_issues");
			expect(issues).toHaveLength(1);
			expect(issues[0]).toMatchObject({
				state: "closed",
				title: "OOO Issue",
			});
		}),
	);

	it.effect("newer PR update is not overwritten by older event", () =>
		Effect.gen(function* () {
			const t = createConvexTest();
			const repositoryId = 12345;
			yield* seedRepository(t, repositoryId);

			yield* insertRawEvent(
				t,
				makeRawEvent({
					deliveryId: "delivery-ooo-pr-newer",
					eventName: "pull_request",
					action: "closed",
					repositoryId,
					payloadJson: makePrPayload({
						action: "closed",
						prId: 6001,
						number: 5,
						state: "closed",
						title: "Latest PR Title",
						updated_at: "2026-02-18T12:00:00Z",
					}),
				}),
			);

			yield* processEvent(t, "delivery-ooo-pr-newer");

			yield* insertRawEvent(
				t,
				makeRawEvent({
					deliveryId: "delivery-ooo-pr-older",
					eventName: "pull_request",
					action: "opened",
					repositoryId,
					payloadJson: makePrPayload({
						action: "opened",
						prId: 6001,
						number: 5,
						state: "open",
						title: "Old PR Title",
						updated_at: "2026-02-18T10:00:00Z",
					}),
				}),
			);

			yield* processEvent(t, "delivery-ooo-pr-older");

			const prs = yield* collectTable<{ state: string; title: string }>(
				t,
				"github_pull_requests",
			);
			expect(prs).toHaveLength(1);
			expect(prs[0]).toMatchObject({
				state: "closed",
				title: "Latest PR Title",
			});
		}),
	);
});

// ---------------------------------------------------------------------------
// Projection Tests
// ---------------------------------------------------------------------------

describe("Projection Correctness", () => {
	it.effect("projections are updated after webhook processing", () =>
		Effect.gen(function* () {
			const t = createConvexTest();
			const repositoryId = 12345;
			yield* seedRepository(t, repositoryId);

			yield* insertRawEvent(
				t,
				makeRawEvent({
					deliveryId: "delivery-proj-issue",
					eventName: "issues",
					action: "opened",
					repositoryId,
					payloadJson: makeIssuePayload({
						action: "opened",
						issueId: 5001,
						number: 1,
						state: "open",
						title: "Projection test issue",
					}),
				}),
			);
			yield* processEvent(t, "delivery-proj-issue");

			yield* insertRawEvent(
				t,
				makeRawEvent({
					deliveryId: "delivery-proj-pr",
					eventName: "pull_request",
					action: "opened",
					repositoryId,
					payloadJson: makePrPayload({
						action: "opened",
						prId: 6001,
						number: 10,
						state: "open",
						title: "Projection test PR",
					}),
				}),
			);
			yield* processEvent(t, "delivery-proj-pr");

			const overviews = yield* collectTable(t, "view_repo_overview");
			expect(overviews).toHaveLength(1);
			expect(overviews[0]).toMatchObject({
				repositoryId,
				fullName: "testowner/testrepo",
				openPrCount: 1,
				openIssueCount: 1,
			});

			const prViews = yield* collectTable(t, "view_repo_pull_request_list");
			expect(prViews).toHaveLength(1);
			expect(prViews[0]).toMatchObject({
				number: 10,
				state: "open",
				title: "Projection test PR",
			});

			const issueViews = yield* collectTable(t, "view_repo_issue_list");
			expect(issueViews).toHaveLength(1);
			expect(issueViews[0]).toMatchObject({
				number: 1,
				state: "open",
				title: "Projection test issue",
			});
		}),
	);

	it.effect("activity feed entries are created after processing", () =>
		Effect.gen(function* () {
			const t = createConvexTest();
			const repositoryId = 12345;
			yield* seedRepository(t, repositoryId);

			yield* insertRawEvent(
				t,
				makeRawEvent({
					deliveryId: "delivery-activity-1",
					eventName: "issues",
					action: "opened",
					repositoryId,
					payloadJson: makeIssuePayload({
						action: "opened",
						issueId: 5001,
						number: 1,
						state: "open",
						title: "Activity test issue",
					}),
				}),
			);
			yield* processEvent(t, "delivery-activity-1");

			const activities = yield* collectTable(t, "view_activity_feed");
			expect(activities).toHaveLength(1);
			expect(activities[0]).toMatchObject({
				repositoryId,
				activityType: "issue.opened",
				title: "Activity test issue",
				actorLogin: "testuser",
				entityNumber: 1,
			});
		}),
	);

	it.effect("push events create activity feed entries", () =>
		Effect.gen(function* () {
			const t = createConvexTest();
			const repositoryId = 12345;
			yield* seedRepository(t, repositoryId);

			yield* insertRawEvent(
				t,
				makeRawEvent({
					deliveryId: "delivery-activity-push",
					eventName: "push",
					action: null,
					repositoryId,
					payloadJson: makePushPayload({
						ref: "refs/heads/main",
						after: "sha-new",
						commits: [
							{
								id: "c1",
								message: "fix: resolve bug",
								timestamp: "2026-02-18T10:00:00Z",
							},
							{
								id: "c2",
								message: "chore: cleanup",
								timestamp: "2026-02-18T10:01:00Z",
							},
						],
					}),
				}),
			);
			yield* processEvent(t, "delivery-activity-push");

			const activities = yield* collectTable(t, "view_activity_feed");
			expect(activities).toHaveLength(1);
			expect(activities[0]).toMatchObject({
				activityType: "push",
				title: "Pushed 2 commits to main",
				actorLogin: "testuser",
			});
		}),
	);

	it.effect("projections update correctly after issue state change", () =>
		Effect.gen(function* () {
			const t = createConvexTest();
			const repositoryId = 12345;
			yield* seedRepository(t, repositoryId);

			yield* insertRawEvent(
				t,
				makeRawEvent({
					deliveryId: "delivery-state-open",
					eventName: "issues",
					action: "opened",
					repositoryId,
					payloadJson: makeIssuePayload({
						action: "opened",
						issueId: 5001,
						number: 1,
						state: "open",
						title: "State change test",
						updated_at: "2026-02-18T10:00:00Z",
					}),
				}),
			);
			yield* processEvent(t, "delivery-state-open");

			let overviews = yield* collectTable<{ openIssueCount: number }>(
				t,
				"view_repo_overview",
			);
			expect(overviews[0]).toMatchObject({ openIssueCount: 1 });

			yield* insertRawEvent(
				t,
				makeRawEvent({
					deliveryId: "delivery-state-close",
					eventName: "issues",
					action: "closed",
					repositoryId,
					payloadJson: makeIssuePayload({
						action: "closed",
						issueId: 5001,
						number: 1,
						state: "closed",
						title: "State change test",
						updated_at: "2026-02-18T12:00:00Z",
					}),
				}),
			);
			yield* processEvent(t, "delivery-state-close");

			overviews = yield* collectTable(t, "view_repo_overview");
			expect(overviews[0]).toMatchObject({ openIssueCount: 0 });

			const issueViews = yield* collectTable<{ state: string }>(
				t,
				"view_repo_issue_list",
			);
			expect(issueViews).toHaveLength(1);
			expect(issueViews[0]).toMatchObject({ state: "closed" });
		}),
	);
});

// ---------------------------------------------------------------------------
// Projection Query Tests (public queries)
// ---------------------------------------------------------------------------

describe("Projection Queries", () => {
	it.effect("listRepos returns repo overview data", () =>
		Effect.gen(function* () {
			const t = createConvexTest();
			const repositoryId = 12345;
			yield* seedRepository(t, repositoryId);

			yield* insertRawEvent(
				t,
				makeRawEvent({
					deliveryId: "delivery-q-issue",
					eventName: "issues",
					action: "opened",
					repositoryId,
					payloadJson: makeIssuePayload({
						action: "opened",
						issueId: 5001,
						number: 1,
						state: "open",
						title: "Query test issue",
					}),
				}),
			);
			yield* processEvent(t, "delivery-q-issue");

			const result = yield* Effect.promise(() =>
				t.query(api.rpc.projectionQueries.listRepos, {}),
			);
			const repos = assertSuccess(result);
			expect(repos).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						repositoryId,
						fullName: "testowner/testrepo",
						openIssueCount: 1,
					}),
				]),
			);
		}),
	);

	it.effect("getRepoOverview returns null for nonexistent repo", () =>
		Effect.gen(function* () {
			const t = createConvexTest();

			const result = yield* Effect.promise(() =>
				t.query(api.rpc.projectionQueries.getRepoOverview, {
					ownerLogin: "nonexistent",
					name: "nope",
				}),
			);
			const value = assertSuccess(result);
			expect(value).toBeNull();
		}),
	);

	it.effect("listActivity returns activity feed entries", () =>
		Effect.gen(function* () {
			const t = createConvexTest();
			const repositoryId = 12345;
			yield* seedRepository(t, repositoryId);

			yield* insertRawEvent(
				t,
				makeRawEvent({
					deliveryId: "delivery-q-activity",
					eventName: "pull_request",
					action: "opened",
					repositoryId,
					payloadJson: makePrPayload({
						action: "opened",
						prId: 6001,
						number: 42,
						state: "open",
						title: "Activity query test PR",
					}),
				}),
			);
			yield* processEvent(t, "delivery-q-activity");

			const result = yield* Effect.promise(() =>
				t.query(api.rpc.projectionQueries.listActivity, {
					ownerLogin: "testowner",
					name: "testrepo",
				}),
			);
			const activities = assertSuccess(result);
			expect(activities).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						activityType: "pr.opened",
						title: "Activity query test PR",
						entityNumber: 42,
					}),
				]),
			);
		}),
	);
});

// ---------------------------------------------------------------------------
// Branch Create/Delete Tests
// ---------------------------------------------------------------------------

describe("Branch Events", () => {
	it.effect("create event adds a branch", () =>
		Effect.gen(function* () {
			const t = createConvexTest();
			const repositoryId = 12345;
			yield* seedRepository(t, repositoryId);

			yield* insertRawEvent(
				t,
				makeRawEvent({
					deliveryId: "delivery-create-branch",
					eventName: "create",
					action: null,
					repositoryId,
					payloadJson: JSON.stringify({
						ref_type: "branch",
						ref: "feature-new",
						master_branch: "main",
						sender: {
							id: 1001,
							login: "testuser",
							avatar_url: null,
							type: "User",
						},
					}),
				}),
			);
			yield* processEvent(t, "delivery-create-branch");

			const branches = yield* collectTable<{
				name: string;
				repositoryId: number;
			}>(t, "github_branches");
			expect(branches).toHaveLength(1);
			expect(branches[0]).toMatchObject({
				name: "feature-new",
				repositoryId,
			});
		}),
	);

	it.effect("delete event removes a branch", () =>
		Effect.gen(function* () {
			const t = createConvexTest();
			const repositoryId = 12345;
			yield* seedRepository(t, repositoryId);

			// Seed a branch first
			yield* Effect.promise(() =>
				t.run(async (ctx) => {
					await ctx.db.insert("github_branches", {
						repositoryId,
						name: "old-feature",
						headSha: "old-sha",
						protected: false,
						updatedAt: Date.now(),
					});
				}),
			);

			yield* insertRawEvent(
				t,
				makeRawEvent({
					deliveryId: "delivery-delete-branch",
					eventName: "delete",
					action: null,
					repositoryId,
					payloadJson: JSON.stringify({
						ref_type: "branch",
						ref: "old-feature",
						sender: {
							id: 1001,
							login: "testuser",
							avatar_url: null,
							type: "User",
						},
					}),
				}),
			);
			yield* processEvent(t, "delivery-delete-branch");

			const branches = yield* collectTable(t, "github_branches");
			expect(branches).toHaveLength(0);
		}),
	);
});

import { createRpcFactory, makeRpcModule } from "@packages/confect/rpc";
import { Effect, Match, Option, Schema } from "effect";
import { ConfectMutationCtx, confectSchema } from "../confect";
import {
	appendActivityFeedEntry,
	updateAllProjections,
} from "../shared/projections";
import { DatabaseRpcTelemetryLayer } from "./telemetry";

const factory = createRpcFactory({ schema: confectSchema });

// ---------------------------------------------------------------------------
// Helpers — extract typed fields from untyped payloads
// ---------------------------------------------------------------------------

const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const bool = (v: unknown): boolean => v === true;
const isoToMs = (v: unknown): number | null => {
	if (typeof v !== "string") return null;
	const ms = new Date(v).getTime();
	return Number.isNaN(ms) ? null : ms;
};

const obj = (v: unknown): Record<string, unknown> =>
	v !== null && v !== undefined && typeof v === "object"
		? (v as Record<string, unknown>)
		: {};

const userType = (v: unknown): "User" | "Bot" | "Organization" =>
	v === "Bot" ? "Bot" : v === "Organization" ? "Organization" : "User";

/**
 * Extract a GitHub user object from a payload field.
 * Returns { githubUserId, login, avatarUrl, siteAdmin, type } or null.
 */
const extractUser = (
	u: unknown,
): {
	githubUserId: number;
	login: string;
	avatarUrl: string | null;
	siteAdmin: boolean;
	type: "User" | "Bot" | "Organization";
} | null => {
	if (
		u !== null &&
		u !== undefined &&
		typeof u === "object" &&
		"id" in u &&
		"login" in u
	) {
		const id = num(u.id);
		const login = str(u.login);
		if (id !== null && login !== null) {
			return {
				githubUserId: id,
				login,
				avatarUrl: "avatar_url" in u ? str(u.avatar_url) : null,
				siteAdmin: "site_admin" in u ? bool(u.site_admin) : false,
				type: "type" in u ? userType(u.type) : "User",
			};
		}
	}
	return null;
};

// ---------------------------------------------------------------------------
// Per-user upsert helper (shared by all handlers)
// ---------------------------------------------------------------------------

const upsertUser = (user: NonNullable<ReturnType<typeof extractUser>>) =>
	Effect.gen(function* () {
		const ctx = yield* ConfectMutationCtx;
		const existing = yield* ctx.db
			.query("github_users")
			.withIndex("by_githubUserId", (q) =>
				q.eq("githubUserId", user.githubUserId),
			)
			.first();

		if (Option.isSome(existing)) {
			yield* ctx.db.patch(existing.value._id, {
				login: user.login,
				avatarUrl: user.avatarUrl,
				siteAdmin: user.siteAdmin,
				type: user.type,
				updatedAt: Date.now(),
			});
		} else {
			yield* ctx.db.insert("github_users", {
				...user,
				updatedAt: Date.now(),
			});
		}
	});

// ---------------------------------------------------------------------------
// Event handlers — each takes parsed payload + mutation context
// ---------------------------------------------------------------------------

/**
 * Handle `issues` events: opened, edited, closed, reopened, labeled, unlabeled, assigned, unassigned
 */
const handleIssuesEvent = (
	payload: Record<string, unknown>,
	repositoryId: number,
) =>
	Effect.gen(function* () {
		const ctx = yield* ConfectMutationCtx;
		const now = Date.now();
		const issue = obj(payload.issue);
		const githubIssueId = num(issue.id);
		const issueNumber = num(issue.number);

		if (githubIssueId === null || issueNumber === null) return;

		// Upsert the issue author
		const authorUser = extractUser(issue.user);
		if (authorUser) yield* upsertUser(authorUser);

		// Extract labels
		const labels = Array.isArray(issue.labels)
			? issue.labels
					.map((l: unknown) => {
						const label = obj(l);
						return str(label.name);
					})
					.filter((n: string | null): n is string => n !== null)
			: [];

		// Extract assignee IDs
		const assigneeUserIds = Array.isArray(issue.assignees)
			? issue.assignees
					.map((a: unknown) => {
						const user = extractUser(a);
						return user?.githubUserId ?? null;
					})
					.filter((id: number | null): id is number => id !== null)
			: [];

		const githubUpdatedAt = isoToMs(issue.updated_at) ?? now;

		const data = {
			repositoryId,
			githubIssueId,
			number: issueNumber,
			state: (issue.state === "open" ? "open" : "closed") as "open" | "closed",
			title: str(issue.title) ?? "",
			body: str(issue.body),
			authorUserId: authorUser?.githubUserId ?? null,
			assigneeUserIds,
			labelNames: labels,
			commentCount: num(issue.comments) ?? 0,
			isPullRequest: "pull_request" in issue,
			closedAt: isoToMs(issue.closed_at),
			githubUpdatedAt,
			cachedAt: now,
		};

		const existing = yield* ctx.db
			.query("github_issues")
			.withIndex("by_repositoryId_and_number", (q) =>
				q.eq("repositoryId", repositoryId).eq("number", issueNumber),
			)
			.first();

		if (Option.isSome(existing)) {
			if (githubUpdatedAt >= existing.value.githubUpdatedAt) {
				yield* ctx.db.patch(existing.value._id, data);
			}
		} else {
			yield* ctx.db.insert("github_issues", data);
		}
	});

/**
 * Handle `pull_request` events: opened, closed, reopened, edited, synchronize, ready_for_review, etc.
 */
const handlePullRequestEvent = (
	payload: Record<string, unknown>,
	repositoryId: number,
) =>
	Effect.gen(function* () {
		const ctx = yield* ConfectMutationCtx;
		const now = Date.now();
		const pr = obj(payload.pull_request);
		const githubPrId = num(pr.id);
		const prNumber = num(pr.number);

		if (githubPrId === null || prNumber === null) return;

		// Upsert author
		const authorUser = extractUser(pr.user);
		if (authorUser) yield* upsertUser(authorUser);

		const head = obj(pr.head);
		const base = obj(pr.base);

		// Extract assignee IDs
		const assigneeUserIds = Array.isArray(pr.assignees)
			? pr.assignees
					.map((a: unknown) => {
						const user = extractUser(a);
						return user?.githubUserId ?? null;
					})
					.filter((id: number | null): id is number => id !== null)
			: [];

		// Extract requested reviewer IDs
		const requestedReviewerUserIds = Array.isArray(pr.requested_reviewers)
			? pr.requested_reviewers
					.map((r: unknown) => {
						const user = extractUser(r);
						return user?.githubUserId ?? null;
					})
					.filter((id: number | null): id is number => id !== null)
			: [];

		const githubUpdatedAt = isoToMs(pr.updated_at) ?? now;

		const data = {
			repositoryId,
			githubPrId,
			number: prNumber,
			state: (pr.state === "open" ? "open" : "closed") as "open" | "closed",
			draft: bool(pr.draft),
			title: str(pr.title) ?? "",
			body: str(pr.body),
			authorUserId: authorUser?.githubUserId ?? null,
			assigneeUserIds,
			requestedReviewerUserIds,
			baseRefName: str(base.ref) ?? "",
			headRefName: str(head.ref) ?? "",
			headSha: str(head.sha) ?? "",
			mergeableState: str(pr.mergeable_state),
			mergedAt: isoToMs(pr.merged_at),
			closedAt: isoToMs(pr.closed_at),
			githubUpdatedAt,
			cachedAt: now,
		};

		const existing = yield* ctx.db
			.query("github_pull_requests")
			.withIndex("by_repositoryId_and_number", (q) =>
				q.eq("repositoryId", repositoryId).eq("number", prNumber),
			)
			.first();

		if (Option.isSome(existing)) {
			if (githubUpdatedAt >= existing.value.githubUpdatedAt) {
				yield* ctx.db.patch(existing.value._id, data);
			}
		} else {
			yield* ctx.db.insert("github_pull_requests", data);
		}
	});

/**
 * Handle `issue_comment` events: created, edited, deleted
 */
const handleIssueCommentEvent = (
	payload: Record<string, unknown>,
	repositoryId: number,
) =>
	Effect.gen(function* () {
		const ctx = yield* ConfectMutationCtx;
		const now = Date.now();
		const action = str(payload.action);
		const comment = obj(payload.comment);
		const issue = obj(payload.issue);
		const githubCommentId = num(comment.id);
		const issueNumber = num(issue.number);

		if (githubCommentId === null || issueNumber === null) return;

		// Upsert comment author
		const authorUser = extractUser(comment.user);
		if (authorUser) yield* upsertUser(authorUser);

		if (action === "deleted") {
			// Remove the comment
			const existing = yield* ctx.db
				.query("github_issue_comments")
				.withIndex("by_repositoryId_and_githubCommentId", (q) =>
					q
						.eq("repositoryId", repositoryId)
						.eq("githubCommentId", githubCommentId),
				)
				.first();
			if (Option.isSome(existing)) {
				yield* ctx.db.delete(existing.value._id);
			}
			return;
		}

		// Upsert comment (created or edited)
		const data = {
			repositoryId,
			issueNumber,
			githubCommentId,
			authorUserId: authorUser?.githubUserId ?? null,
			body: str(comment.body) ?? "",
			createdAt: isoToMs(comment.created_at) ?? now,
			updatedAt: isoToMs(comment.updated_at) ?? now,
		};

		const existing = yield* ctx.db
			.query("github_issue_comments")
			.withIndex("by_repositoryId_and_githubCommentId", (q) =>
				q
					.eq("repositoryId", repositoryId)
					.eq("githubCommentId", githubCommentId),
			)
			.first();

		if (Option.isSome(existing)) {
			yield* ctx.db.patch(existing.value._id, data);
		} else {
			yield* ctx.db.insert("github_issue_comments", data);
		}
	});

/**
 * Handle `push` events — update branch head SHA + extract commits
 */
const handlePushEvent = (
	payload: Record<string, unknown>,
	repositoryId: number,
) =>
	Effect.gen(function* () {
		const ctx = yield* ConfectMutationCtx;
		const now = Date.now();
		const ref = str(payload.ref);
		const after = str(payload.after);

		if (!ref || !after) return;

		// ref is like "refs/heads/main" — extract branch name
		const branchPrefix = "refs/heads/";
		if (!ref.startsWith(branchPrefix)) return;
		const branchName = ref.slice(branchPrefix.length);

		// Check if branch was deleted (after is all zeros)
		const deleted = bool(payload.deleted);
		if (deleted) {
			const existing = yield* ctx.db
				.query("github_branches")
				.withIndex("by_repositoryId_and_name", (q) =>
					q.eq("repositoryId", repositoryId).eq("name", branchName),
				)
				.first();
			if (Option.isSome(existing)) {
				yield* ctx.db.delete(existing.value._id);
			}
			return;
		}

		// Upsert branch with new head SHA
		const existingBranch = yield* ctx.db
			.query("github_branches")
			.withIndex("by_repositoryId_and_name", (q) =>
				q.eq("repositoryId", repositoryId).eq("name", branchName),
			)
			.first();

		if (Option.isSome(existingBranch)) {
			yield* ctx.db.patch(existingBranch.value._id, {
				headSha: after,
				updatedAt: now,
			});
		} else {
			yield* ctx.db.insert("github_branches", {
				repositoryId,
				name: branchName,
				headSha: after,
				protected: false,
				updatedAt: now,
			});
		}

		// Extract commits from push payload
		const commits = Array.isArray(payload.commits) ? payload.commits : [];
		for (const rawCommit of commits) {
			const c = obj(rawCommit);
			const sha = str(c.id);
			if (!sha) continue;

			// Extract author/committer user IDs from the commit
			const authorObj = obj(c.author);
			const committerObj = obj(c.committer);

			// Push webhook commit authors don't have full user objects with IDs
			// They have name, email, username fields instead
			// We can't reliably map to githubUserId without an API call

			const messageHeadline = str(c.message)?.split("\n")[0] ?? "";

			const existingCommit = yield* ctx.db
				.query("github_commits")
				.withIndex("by_repositoryId_and_sha", (q) =>
					q.eq("repositoryId", repositoryId).eq("sha", sha),
				)
				.first();

			if (Option.isNone(existingCommit)) {
				yield* ctx.db.insert("github_commits", {
					repositoryId,
					sha,
					authorUserId: null,
					committerUserId: null,
					messageHeadline,
					authoredAt: isoToMs(c.timestamp),
					committedAt: isoToMs(c.timestamp),
					additions: null,
					deletions: null,
					changedFiles: null,
					cachedAt: now,
				});
			}
		}

		// Also upsert the pusher as a user if available
		const pusher = extractUser(payload.sender);
		if (pusher) yield* upsertUser(pusher);
	});

/**
 * Handle `pull_request_review` events: submitted, edited, dismissed
 */
const handlePullRequestReviewEvent = (
	payload: Record<string, unknown>,
	repositoryId: number,
) =>
	Effect.gen(function* () {
		const ctx = yield* ConfectMutationCtx;
		const review = obj(payload.review);
		const pr = obj(payload.pull_request);
		const githubReviewId = num(review.id);
		const pullRequestNumber = num(pr.number);

		if (githubReviewId === null || pullRequestNumber === null) return;

		// Upsert reviewer
		const authorUser = extractUser(review.user);
		if (authorUser) yield* upsertUser(authorUser);

		const data = {
			repositoryId,
			pullRequestNumber,
			githubReviewId,
			authorUserId: authorUser?.githubUserId ?? null,
			state: str(review.state) ?? "commented",
			submittedAt: isoToMs(review.submitted_at),
			commitSha: str(review.commit_id),
		};

		const existing = yield* ctx.db
			.query("github_pull_request_reviews")
			.withIndex("by_repositoryId_and_githubReviewId", (q) =>
				q.eq("repositoryId", repositoryId).eq("githubReviewId", githubReviewId),
			)
			.first();

		if (Option.isSome(existing)) {
			yield* ctx.db.patch(existing.value._id, data);
		} else {
			yield* ctx.db.insert("github_pull_request_reviews", data);
		}
	});

/**
 * Handle `create` events — new branch or tag created
 */
const handleCreateEvent = (
	payload: Record<string, unknown>,
	repositoryId: number,
) =>
	Effect.gen(function* () {
		const ctx = yield* ConfectMutationCtx;
		const now = Date.now();
		const refType = str(payload.ref_type);
		const ref = str(payload.ref);

		// Only handle branches (not tags)
		if (refType !== "branch" || !ref) return;

		const existing = yield* ctx.db
			.query("github_branches")
			.withIndex("by_repositoryId_and_name", (q) =>
				q.eq("repositoryId", repositoryId).eq("name", ref),
			)
			.first();

		if (Option.isNone(existing)) {
			// We don't have the SHA from a create event, use empty string as placeholder
			// The next push event will update it
			yield* ctx.db.insert("github_branches", {
				repositoryId,
				name: ref,
				headSha: str(payload.master_branch) ?? "",
				protected: false,
				updatedAt: now,
			});
		}
	});

/**
 * Handle `check_run` events: created, completed, rerequested, requested_action
 */
const handleCheckRunEvent = (
	payload: Record<string, unknown>,
	repositoryId: number,
) =>
	Effect.gen(function* () {
		const ctx = yield* ConfectMutationCtx;
		const checkRun = obj(payload.check_run);
		const githubCheckRunId = num(checkRun.id);
		const name = str(checkRun.name);
		const headSha = str(checkRun.head_sha);

		if (githubCheckRunId === null || !name || !headSha) return;

		const data = {
			repositoryId,
			githubCheckRunId,
			name,
			headSha,
			status: str(checkRun.status) ?? "queued",
			conclusion: str(checkRun.conclusion),
			startedAt: isoToMs(checkRun.started_at),
			completedAt: isoToMs(checkRun.completed_at),
		};

		const existing = yield* ctx.db
			.query("github_check_runs")
			.withIndex("by_repositoryId_and_githubCheckRunId", (q) =>
				q
					.eq("repositoryId", repositoryId)
					.eq("githubCheckRunId", githubCheckRunId),
			)
			.first();

		if (Option.isSome(existing)) {
			yield* ctx.db.patch(existing.value._id, data);
		} else {
			yield* ctx.db.insert("github_check_runs", data);
		}
	});

/**
 * Handle `delete` events — branch or tag deleted
 */
const handleDeleteEvent = (
	payload: Record<string, unknown>,
	repositoryId: number,
) =>
	Effect.gen(function* () {
		const ctx = yield* ConfectMutationCtx;
		const refType = str(payload.ref_type);
		const ref = str(payload.ref);

		if (refType !== "branch" || !ref) return;

		const existing = yield* ctx.db
			.query("github_branches")
			.withIndex("by_repositoryId_and_name", (q) =>
				q.eq("repositoryId", repositoryId).eq("name", ref),
			)
			.first();

		if (Option.isSome(existing)) {
			yield* ctx.db.delete(existing.value._id);
		}
	});

// ---------------------------------------------------------------------------
// Shared dispatcher — used by both single-event and batch processors
// ---------------------------------------------------------------------------

const dispatchHandler = (
	eventName: string,
	payload: Record<string, unknown>,
	repositoryId: number,
) =>
	Match.value(eventName).pipe(
		Match.when("issues", () => handleIssuesEvent(payload, repositoryId)),
		Match.when("pull_request", () =>
			handlePullRequestEvent(payload, repositoryId),
		),
		Match.when("issue_comment", () =>
			handleIssueCommentEvent(payload, repositoryId),
		),
		Match.when("push", () => handlePushEvent(payload, repositoryId)),
		Match.when("pull_request_review", () =>
			handlePullRequestReviewEvent(payload, repositoryId),
		),
		Match.when("check_run", () => handleCheckRunEvent(payload, repositoryId)),
		Match.when("create", () => handleCreateEvent(payload, repositoryId)),
		Match.when("delete", () => handleDeleteEvent(payload, repositoryId)),
		Match.orElse(() => Effect.void),
	);

// ---------------------------------------------------------------------------
// Activity feed extraction — build activity entry from webhook payload
// ---------------------------------------------------------------------------

type ActivityInfo = {
	activityType: string;
	title: string;
	description: string | null;
	actorLogin: string | null;
	actorAvatarUrl: string | null;
	entityNumber: number | null;
};

/**
 * Extract activity feed information from a webhook event.
 * Returns null for events that shouldn't appear in the feed (e.g. unknown events).
 */
const extractActivityInfo = (
	eventName: string,
	action: string | null,
	payload: Record<string, unknown>,
): ActivityInfo | null => {
	const sender = extractUser(payload.sender);
	const actorLogin = sender?.login ?? null;
	const actorAvatarUrl = sender?.avatarUrl ?? null;

	return Match.value(eventName).pipe(
		Match.when("issues", () => {
			const issue = obj(payload.issue);
			const number = num(issue.number);
			const title = str(issue.title) ?? "";
			return {
				activityType: `issue.${action ?? "updated"}`,
				title,
				description:
					action === "opened" ? (str(issue.body)?.slice(0, 200) ?? null) : null,
				actorLogin,
				actorAvatarUrl,
				entityNumber: number,
			};
		}),
		Match.when("pull_request", () => {
			const pr = obj(payload.pull_request);
			const number = num(pr.number);
			const title = str(pr.title) ?? "";
			return {
				activityType: `pr.${action ?? "updated"}`,
				title,
				description:
					action === "opened" ? (str(pr.body)?.slice(0, 200) ?? null) : null,
				actorLogin,
				actorAvatarUrl,
				entityNumber: number,
			};
		}),
		Match.when("issue_comment", () => {
			const issue = obj(payload.issue);
			const comment = obj(payload.comment);
			const number = num(issue.number);
			const isPr = "pull_request" in issue;
			return {
				activityType: isPr
					? `pr_comment.${action ?? "created"}`
					: `issue_comment.${action ?? "created"}`,
				title: str(issue.title) ?? "",
				description: str(comment.body)?.slice(0, 200) ?? null,
				actorLogin,
				actorAvatarUrl,
				entityNumber: number,
			};
		}),
		Match.when("push", () => {
			const ref = str(payload.ref);
			const branchName = ref?.startsWith("refs/heads/")
				? ref.slice("refs/heads/".length)
				: ref;
			const commits = Array.isArray(payload.commits) ? payload.commits : [];
			const commitCount = commits.length;
			return {
				activityType: "push",
				title: `Pushed ${commitCount} commit${commitCount !== 1 ? "s" : ""} to ${branchName ?? "unknown"}`,
				description:
					commitCount > 0
						? (str(obj(commits[0]).message)?.split("\n")[0] ?? null)
						: null,
				actorLogin,
				actorAvatarUrl,
				entityNumber: null,
			};
		}),
		Match.when("pull_request_review", () => {
			const pr = obj(payload.pull_request);
			const review = obj(payload.review);
			const number = num(pr.number);
			const state = str(review.state) ?? "commented";
			return {
				activityType: `pr_review.${state}`,
				title: str(pr.title) ?? "",
				description: null,
				actorLogin,
				actorAvatarUrl,
				entityNumber: number,
			};
		}),
		Match.when("check_run", () => {
			const checkRun = obj(payload.check_run);
			const name = str(checkRun.name) ?? "Check";
			const conclusion = str(checkRun.conclusion);
			// Only emit activity for completed check runs
			if (action !== "completed") return null;
			return {
				activityType: `check_run.${conclusion ?? "completed"}`,
				title: name,
				description: conclusion ? `Conclusion: ${conclusion}` : null,
				actorLogin,
				actorAvatarUrl,
				entityNumber: null,
			};
		}),
		Match.when("create", () => {
			const refType = str(payload.ref_type);
			const ref = str(payload.ref);
			if (refType !== "branch") return null;
			return {
				activityType: "branch.created",
				title: `Created branch ${ref ?? "unknown"}`,
				description: null,
				actorLogin,
				actorAvatarUrl,
				entityNumber: null,
			};
		}),
		Match.when("delete", () => {
			const refType = str(payload.ref_type);
			const ref = str(payload.ref);
			if (refType !== "branch") return null;
			return {
				activityType: "branch.deleted",
				title: `Deleted branch ${ref ?? "unknown"}`,
				description: null,
				actorLogin,
				actorAvatarUrl,
				entityNumber: null,
			};
		}),
		Match.orElse(() => null),
	);
};

// ---------------------------------------------------------------------------
// Processor — dispatches raw webhook events to appropriate handlers
// ---------------------------------------------------------------------------

/**
 * Process a single raw webhook event.
 * Reads the event from github_webhook_events_raw by deliveryId,
 * dispatches to the appropriate handler, and marks the event as processed.
 */
const processWebhookEventDef = factory.internalMutation({
	payload: {
		deliveryId: Schema.String,
	},
	success: Schema.Struct({
		processed: Schema.Boolean,
		eventName: Schema.String,
		action: Schema.NullOr(Schema.String),
	}),
});

/**
 * Process all pending webhook events.
 * Iterates through events with processState="pending" and processes each one.
 */
const processAllPendingDef = factory.internalMutation({
	success: Schema.Struct({
		processed: Schema.Number,
		failed: Schema.Number,
	}),
});

processWebhookEventDef.implement((args) =>
	Effect.gen(function* () {
		const ctx = yield* ConfectMutationCtx;

		// Look up the raw event
		const rawEvent = yield* ctx.db
			.query("github_webhook_events_raw")
			.withIndex("by_deliveryId", (q) => q.eq("deliveryId", args.deliveryId))
			.first();

		if (Option.isNone(rawEvent)) {
			return {
				processed: false,
				eventName: "unknown",
				action: null,
			};
		}

		const event = rawEvent.value;

		// Skip if already processed
		if (event.processState === "processed") {
			return {
				processed: true,
				eventName: event.eventName,
				action: event.action,
			};
		}

		const payload: Record<string, unknown> = JSON.parse(event.payloadJson);
		const repositoryId = event.repositoryId;

		// Skip events without a repository
		if (repositoryId === null) {
			yield* ctx.db.patch(event._id, {
				processState: "processed",
			});
			return {
				processed: true,
				eventName: event.eventName,
				action: event.action,
			};
		}

		// Dispatch to handler based on event name
		yield* dispatchHandler(event.eventName, payload, repositoryId).pipe(
			Effect.catchAll((error) =>
				Effect.gen(function* () {
					// Mark as failed
					yield* ctx.db.patch(event._id, {
						processState: "failed",
						processError: String(error),
					});
				}),
			),
		);

		// Mark as processed (if not already failed above)
		const currentState = yield* ctx.db.get(event._id);
		if (
			Option.isSome(currentState) &&
			currentState.value.processState !== "failed"
		) {
			yield* ctx.db.patch(event._id, {
				processState: "processed",
			});

			// Append activity feed entry
			const activityInfo = extractActivityInfo(
				event.eventName,
				event.action,
				payload,
			);
			if (activityInfo !== null) {
				yield* appendActivityFeedEntry(
					repositoryId,
					event.installationId ?? 0,
					activityInfo.activityType,
					activityInfo.title,
					activityInfo.description,
					activityInfo.actorLogin,
					activityInfo.actorAvatarUrl,
					activityInfo.entityNumber,
				).pipe(Effect.ignoreLogged);
			}

			// Update projections after successful processing
			yield* updateAllProjections(repositoryId).pipe(Effect.ignoreLogged);
		}

		return {
			processed: true,
			eventName: event.eventName,
			action: event.action,
		};
	}),
);

processAllPendingDef.implement(() =>
	Effect.gen(function* () {
		const ctx = yield* ConfectMutationCtx;
		let processed = 0;
		let failed = 0;

		const pendingEvents = yield* ctx.db
			.query("github_webhook_events_raw")
			.withIndex("by_processState_and_receivedAt", (q) =>
				q.eq("processState", "pending"),
			)
			.take(100);

		for (const event of pendingEvents) {
			const payload: Record<string, unknown> = JSON.parse(event.payloadJson);
			const repositoryId = event.repositoryId;

			if (repositoryId === null) {
				yield* ctx.db.patch(event._id, {
					processState: "processed",
				});
				processed++;
				continue;
			}

			const result = yield* dispatchHandler(
				event.eventName,
				payload,
				repositoryId,
			).pipe(
				Effect.map(() => true),
				Effect.catchAll((error) =>
					Effect.gen(function* () {
						yield* ctx.db.patch(event._id, {
							processState: "failed",
							processError: String(error),
						});
						return false;
					}),
				),
			);

			if (result) {
				yield* ctx.db.patch(event._id, {
					processState: "processed",
				});

				// Append activity feed entry
				const activityInfo = extractActivityInfo(
					event.eventName,
					event.action,
					payload,
				);
				if (activityInfo !== null) {
					yield* appendActivityFeedEntry(
						repositoryId,
						event.installationId ?? 0,
						activityInfo.activityType,
						activityInfo.title,
						activityInfo.description,
						activityInfo.actorLogin,
						activityInfo.actorAvatarUrl,
						activityInfo.entityNumber,
					).pipe(Effect.ignoreLogged);
				}

				// Update projections after successful processing
				yield* updateAllProjections(repositoryId).pipe(Effect.ignoreLogged);
				processed++;
			} else {
				failed++;
			}
		}

		return { processed, failed };
	}),
);

const webhookProcessorModule = makeRpcModule(
	{
		processWebhookEvent: processWebhookEventDef,
		processAllPending: processAllPendingDef,
	},
	{ middlewares: DatabaseRpcTelemetryLayer },
);

export const { processWebhookEvent, processAllPending } =
	webhookProcessorModule.handlers;
export { webhookProcessorModule };
export type WebhookProcessorModule = typeof webhookProcessorModule;

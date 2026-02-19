import { createRpcFactory, makeRpcModule } from "@packages/confect/rpc";
import { Effect, Schema } from "effect";
import { ConfectMutationCtx, ConfectQueryCtx, confectSchema } from "../confect";
import { updateAllProjections } from "../shared/projections";
import { DatabaseRpcTelemetryLayer } from "./telemetry";

const factory = createRpcFactory({ schema: confectSchema });

// ---------------------------------------------------------------------------
// Endpoint definitions (schema only — no handler bodies)
// ---------------------------------------------------------------------------

const healthCheckDef = factory.query({
	success: Schema.Struct({
		ok: Schema.Boolean,
		tableCount: Schema.Number,
	}),
});

const tableCountsDef = factory.query({
	success: Schema.Struct({
		repositories: Schema.Number,
		branches: Schema.Number,
		commits: Schema.Number,
		pullRequests: Schema.Number,
		pullRequestReviews: Schema.Number,
		issues: Schema.Number,
		issueComments: Schema.Number,
		checkRuns: Schema.Number,
		users: Schema.Number,
		syncJobs: Schema.Number,
		installations: Schema.Number,
		webhookEvents: Schema.Number,
	}),
});

const syncJobStatusDef = factory.query({
	success: Schema.Array(
		Schema.Struct({
			lockKey: Schema.String,
			state: Schema.String,
			attemptCount: Schema.Number,
			lastError: Schema.NullOr(Schema.String),
			jobType: Schema.String,
			triggerReason: Schema.String,
		}),
	),
});

/**
 * Rebuild all projection views from normalized tables.
 * Iterates all connected repositories and runs updateAllProjections on each.
 * Scheduled via cron on a slow cadence (e.g. every 5 minutes) to catch any
 * drift between normalized data and projection views.
 */
const repairProjectionsDef = factory.internalMutation({
	success: Schema.Struct({
		repairedRepoCount: Schema.Number,
	}),
});

/**
 * Queue health summary — webhook event counts by state.
 */
const queueHealthDef = factory.internalQuery({
	success: Schema.Struct({
		pending: Schema.Number,
		retry: Schema.Number,
		processed: Schema.Number,
		failed: Schema.Number,
		deadLetters: Schema.Number,
	}),
});

/**
 * Comprehensive system status for operational dashboard.
 * Includes queue health, processing lag, write op summary,
 * and stale projection detection.
 */
const systemStatusDef = factory.query({
	success: Schema.Struct({
		queue: Schema.Struct({
			pending: Schema.Number,
			retry: Schema.Number,
			failed: Schema.Number,
			deadLetters: Schema.Number,
			recentProcessedLastHour: Schema.Number,
		}),
		processing: Schema.Struct({
			/** Average lag in ms from receivedAt to now for pending events */
			avgPendingLagMs: Schema.NullOr(Schema.Number),
			/** Oldest pending event age in ms */
			maxPendingLagMs: Schema.NullOr(Schema.Number),
			/** Number of events stuck in retry > 5 minutes */
			staleRetryCount: Schema.Number,
		}),
		writeOps: Schema.Struct({
			pending: Schema.Number,
			completed: Schema.Number,
			failed: Schema.Number,
			confirmed: Schema.Number,
		}),
		projections: Schema.Struct({
			/** Number of repos with overview projection */
			overviewCount: Schema.Number,
			/** Number of connected repos */
			repoCount: Schema.Number,
			/** True if every repo has an overview projection */
			allSynced: Schema.Boolean,
		}),
	}),
});

// ---------------------------------------------------------------------------
// Implementations
// ---------------------------------------------------------------------------

healthCheckDef.implement(() =>
	Effect.gen(function* () {
		const ctx = yield* ConfectQueryCtx;
		const repos = yield* ctx.db.query("github_repositories").take(1);
		return {
			ok: true,
			tableCount: repos.length,
		};
	}),
);

tableCountsDef.implement(() =>
	Effect.gen(function* () {
		const ctx = yield* ConfectQueryCtx;
		// Bounded counts — cap at 10000 per table to avoid unbounded reads
		const cap = 10001;
		const count = (items: Array<unknown>) => Math.min(items.length, 10000);

		const repositories = yield* ctx.db.query("github_repositories").take(cap);
		const branches = yield* ctx.db.query("github_branches").take(cap);
		const commits = yield* ctx.db.query("github_commits").take(cap);
		const pullRequests = yield* ctx.db.query("github_pull_requests").take(cap);
		const pullRequestReviews = yield* ctx.db
			.query("github_pull_request_reviews")
			.take(cap);
		const issues = yield* ctx.db.query("github_issues").take(cap);
		const issueComments = yield* ctx.db
			.query("github_issue_comments")
			.take(cap);
		const checkRuns = yield* ctx.db.query("github_check_runs").take(cap);
		const users = yield* ctx.db.query("github_users").take(cap);
		const syncJobs = yield* ctx.db.query("github_sync_jobs").take(cap);
		const installations = yield* ctx.db.query("github_installations").take(cap);
		const webhookEvents = yield* ctx.db
			.query("github_webhook_events_raw")
			.take(cap);
		return {
			repositories: count(repositories),
			branches: count(branches),
			commits: count(commits),
			pullRequests: count(pullRequests),
			pullRequestReviews: count(pullRequestReviews),
			issues: count(issues),
			issueComments: count(issueComments),
			checkRuns: count(checkRuns),
			users: count(users),
			syncJobs: count(syncJobs),
			installations: count(installations),
			webhookEvents: count(webhookEvents),
		};
	}),
);

syncJobStatusDef.implement(() =>
	Effect.gen(function* () {
		const ctx = yield* ConfectQueryCtx;
		const jobs = yield* ctx.db.query("github_sync_jobs").collect();
		return jobs.map((j) => ({
			lockKey: j.lockKey,
			state: j.state,
			attemptCount: j.attemptCount,
			lastError: j.lastError,
			jobType: j.jobType,
			triggerReason: j.triggerReason,
		}));
	}),
);

repairProjectionsDef.implement(() =>
	Effect.gen(function* () {
		const ctx = yield* ConfectMutationCtx;
		const repos = yield* ctx.db.query("github_repositories").collect();
		let repairedRepoCount = 0;
		for (const repo of repos) {
			yield* updateAllProjections(repo.githubRepoId).pipe(Effect.ignoreLogged);
			repairedRepoCount++;
		}
		return { repairedRepoCount };
	}),
);

queueHealthDef.implement(() =>
	Effect.gen(function* () {
		const ctx = yield* ConfectQueryCtx;

		// Count by state using indexed queries.
		// Pending/retry/failed should always be small (actionable items).
		// Processed can grow large, so we count with a bounded take.
		const countByState = (
			state: "pending" | "processed" | "failed" | "retry",
		) =>
			ctx.db
				.query("github_webhook_events_raw")
				.withIndex("by_processState_and_receivedAt", (q) =>
					q.eq("processState", state),
				)
				.take(10001)
				.pipe(Effect.map((items) => Math.min(items.length, 10000)));

		const pending = yield* countByState("pending");
		const retry = yield* countByState("retry");
		const processed = yield* countByState("processed");
		const failed = yield* countByState("failed");
		const deadLetters = yield* ctx.db
			.query("github_dead_letters")
			.take(10001)
			.pipe(Effect.map((items) => Math.min(items.length, 10000)));

		return {
			pending,
			retry,
			processed,
			failed,
			deadLetters,
		};
	}),
);

systemStatusDef.implement(() =>
	Effect.gen(function* () {
		const ctx = yield* ConfectQueryCtx;
		const now = Date.now();
		const cap = 10001;
		const count = (items: Array<unknown>) => Math.min(items.length, 10000);

		// -- Queue health --
		const boundedQueueCount = (
			state: "pending" | "processed" | "failed" | "retry",
		) =>
			ctx.db
				.query("github_webhook_events_raw")
				.withIndex("by_processState_and_receivedAt", (q) =>
					q.eq("processState", state),
				)
				.take(cap)
				.pipe(Effect.map(count));

		const queuePending = yield* boundedQueueCount("pending");
		const queueRetry = yield* boundedQueueCount("retry");
		const queueFailed = yield* boundedQueueCount("failed");
		const deadLetterItems = yield* ctx.db
			.query("github_dead_letters")
			.take(cap);
		const oneHourAgo = now - 3_600_000;
		const recentProcessed = yield* ctx.db
			.query("github_webhook_events_raw")
			.withIndex("by_processState_and_receivedAt", (q) =>
				q.eq("processState", "processed").gte("receivedAt", oneHourAgo),
			)
			.take(cap);

		// -- Processing lag (from pending events) --
		const pendingEvents = yield* ctx.db
			.query("github_webhook_events_raw")
			.withIndex("by_processState_and_receivedAt", (q) =>
				q.eq("processState", "pending"),
			)
			.take(100);

		let avgPendingLagMs: number | null = null;
		let maxPendingLagMs: number | null = null;
		if (pendingEvents.length > 0) {
			const lags = pendingEvents.map((e) => now - e.receivedAt);
			avgPendingLagMs = Math.round(
				lags.reduce((a, b) => a + b, 0) / lags.length,
			);
			maxPendingLagMs = Math.max(...lags);
		}

		// Stale retries: events in retry state for > 5 minutes
		const fiveMinAgo = now - 300_000;
		const staleRetries = yield* ctx.db
			.query("github_webhook_events_raw")
			.withIndex("by_processState_and_receivedAt", (q) =>
				q.eq("processState", "retry").lte("receivedAt", fiveMinAgo),
			)
			.take(cap);

		// -- Write operations summary (single bounded scan, count in-memory) --
		const allWriteOps = yield* ctx.db
			.query("github_write_operations")
			.take(cap);
		const writeOpsPending = allWriteOps.filter(
			(o) => o.state === "pending",
		).length;
		const writeOpsCompleted = allWriteOps.filter(
			(o) => o.state === "completed",
		).length;
		const writeOpsFailed = allWriteOps.filter(
			(o) => o.state === "failed",
		).length;
		const writeOpsConfirmed = allWriteOps.filter(
			(o) => o.state === "confirmed",
		).length;

		// -- Projection staleness --
		const repos = yield* ctx.db.query("github_repositories").take(cap);
		const overviews = yield* ctx.db.query("view_repo_overview").take(cap);

		return {
			queue: {
				pending: queuePending,
				retry: queueRetry,
				failed: queueFailed,
				deadLetters: count(deadLetterItems),
				recentProcessedLastHour: count(recentProcessed),
			},
			processing: {
				avgPendingLagMs,
				maxPendingLagMs,
				staleRetryCount: count(staleRetries),
			},
			writeOps: {
				pending: writeOpsPending,
				completed: writeOpsCompleted,
				failed: writeOpsFailed,
				confirmed: writeOpsConfirmed,
			},
			projections: {
				overviewCount: overviews.length,
				repoCount: repos.length,
				allSynced: overviews.length >= repos.length,
			},
		};
	}),
);

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

const adminModule = makeRpcModule(
	{
		healthCheck: healthCheckDef,
		tableCounts: tableCountsDef,
		syncJobStatus: syncJobStatusDef,
		repairProjections: repairProjectionsDef,
		queueHealth: queueHealthDef,
		systemStatus: systemStatusDef,
	},
	{ middlewares: DatabaseRpcTelemetryLayer },
);

export const {
	healthCheck,
	tableCounts,
	syncJobStatus,
	repairProjections,
	queueHealth,
	systemStatus,
} = adminModule.handlers;
export { adminModule };
export type AdminModule = typeof adminModule;

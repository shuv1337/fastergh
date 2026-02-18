import { defineSchema, defineTable } from "@packages/confect/schema";
import { Schema } from "effect";

// ============================================================
// A) Control + Ingestion Tables
// ============================================================

const GitHubInstallationSchema = Schema.Struct({
	installationId: Schema.Number,
	accountId: Schema.Number,
	accountLogin: Schema.String,
	accountType: Schema.Literal("User", "Organization"),
	suspendedAt: Schema.NullOr(Schema.Number),
	permissionsDigest: Schema.String,
	eventsDigest: Schema.String,
	updatedAt: Schema.Number,
});

const GitHubSyncJobSchema = Schema.Struct({
	jobType: Schema.Literal("backfill", "reconcile", "replay"),
	scopeType: Schema.Literal("installation", "repository", "entity"),
	triggerReason: Schema.Literal(
		"install",
		"repo_added",
		"manual",
		"reconcile",
		"replay",
	),
	lockKey: Schema.String,
	installationId: Schema.NullOr(Schema.Number),
	repositoryId: Schema.NullOr(Schema.Number),
	entityType: Schema.NullOr(Schema.String),
	state: Schema.Literal("pending", "running", "retry", "done", "failed"),
	attemptCount: Schema.Number,
	nextRunAt: Schema.Number,
	lastError: Schema.NullOr(Schema.String),
	createdAt: Schema.Number,
	updatedAt: Schema.Number,
});

const GitHubSyncCursorSchema = Schema.Struct({
	cursorKey: Schema.String,
	cursorValue: Schema.NullOr(Schema.String),
	watermarkAt: Schema.NullOr(Schema.Number),
	updatedAt: Schema.Number,
});

const GitHubWebhookEventRawSchema = Schema.Struct({
	deliveryId: Schema.String,
	eventName: Schema.String,
	action: Schema.NullOr(Schema.String),
	installationId: Schema.NullOr(Schema.Number),
	repositoryId: Schema.NullOr(Schema.Number),
	signatureValid: Schema.Boolean,
	payloadJson: Schema.String,
	receivedAt: Schema.Number,
	processState: Schema.Literal("pending", "processed", "failed"),
	processError: Schema.NullOr(Schema.String),
});

const GitHubDeadLetterSchema = Schema.Struct({
	deliveryId: Schema.String,
	reason: Schema.String,
	payloadJson: Schema.String,
	createdAt: Schema.Number,
});

// ============================================================
// B) Normalized Domain Tables
// ============================================================

const GitHubUserSchema = Schema.Struct({
	githubUserId: Schema.Number,
	login: Schema.String,
	avatarUrl: Schema.NullOr(Schema.String),
	siteAdmin: Schema.Boolean,
	type: Schema.Literal("User", "Bot", "Organization"),
	updatedAt: Schema.Number,
});

const GitHubOrganizationSchema = Schema.Struct({
	githubOrgId: Schema.Number,
	login: Schema.String,
	name: Schema.NullOr(Schema.String),
	avatarUrl: Schema.NullOr(Schema.String),
	updatedAt: Schema.Number,
});

const GitHubRepositorySchema = Schema.Struct({
	githubRepoId: Schema.Number,
	installationId: Schema.Number,
	ownerId: Schema.Number,
	ownerLogin: Schema.String,
	name: Schema.String,
	fullName: Schema.String,
	private: Schema.Boolean,
	visibility: Schema.Literal("public", "private", "internal"),
	defaultBranch: Schema.String,
	archived: Schema.Boolean,
	disabled: Schema.Boolean,
	fork: Schema.Boolean,
	pushedAt: Schema.NullOr(Schema.Number),
	githubUpdatedAt: Schema.Number,
	cachedAt: Schema.Number,
});

const GitHubBranchSchema = Schema.Struct({
	repositoryId: Schema.Number,
	name: Schema.String,
	headSha: Schema.String,
	protected: Schema.Boolean,
	updatedAt: Schema.Number,
});

const GitHubCommitSchema = Schema.Struct({
	repositoryId: Schema.Number,
	sha: Schema.String,
	authorUserId: Schema.NullOr(Schema.Number),
	committerUserId: Schema.NullOr(Schema.Number),
	messageHeadline: Schema.String,
	authoredAt: Schema.NullOr(Schema.Number),
	committedAt: Schema.NullOr(Schema.Number),
	additions: Schema.NullOr(Schema.Number),
	deletions: Schema.NullOr(Schema.Number),
	changedFiles: Schema.NullOr(Schema.Number),
	cachedAt: Schema.Number,
});

const GitHubPullRequestSchema = Schema.Struct({
	repositoryId: Schema.Number,
	githubPrId: Schema.Number,
	number: Schema.Number,
	state: Schema.Literal("open", "closed"),
	draft: Schema.Boolean,
	title: Schema.String,
	body: Schema.NullOr(Schema.String),
	authorUserId: Schema.NullOr(Schema.Number),
	assigneeUserIds: Schema.Array(Schema.Number),
	requestedReviewerUserIds: Schema.Array(Schema.Number),
	baseRefName: Schema.String,
	headRefName: Schema.String,
	headSha: Schema.String,
	mergeableState: Schema.NullOr(Schema.String),
	mergedAt: Schema.NullOr(Schema.Number),
	closedAt: Schema.NullOr(Schema.Number),
	githubUpdatedAt: Schema.Number,
	cachedAt: Schema.Number,
});

const GitHubPullRequestReviewSchema = Schema.Struct({
	repositoryId: Schema.Number,
	pullRequestNumber: Schema.Number,
	githubReviewId: Schema.Number,
	authorUserId: Schema.NullOr(Schema.Number),
	state: Schema.String,
	submittedAt: Schema.NullOr(Schema.Number),
	commitSha: Schema.NullOr(Schema.String),
});

const GitHubIssueSchema = Schema.Struct({
	repositoryId: Schema.Number,
	githubIssueId: Schema.Number,
	number: Schema.Number,
	state: Schema.Literal("open", "closed"),
	title: Schema.String,
	body: Schema.NullOr(Schema.String),
	authorUserId: Schema.NullOr(Schema.Number),
	assigneeUserIds: Schema.Array(Schema.Number),
	labelNames: Schema.Array(Schema.String),
	commentCount: Schema.Number,
	isPullRequest: Schema.Boolean,
	closedAt: Schema.NullOr(Schema.Number),
	githubUpdatedAt: Schema.Number,
	cachedAt: Schema.Number,
});

const GitHubIssueCommentSchema = Schema.Struct({
	repositoryId: Schema.Number,
	issueNumber: Schema.Number,
	githubCommentId: Schema.Number,
	authorUserId: Schema.NullOr(Schema.Number),
	body: Schema.String,
	createdAt: Schema.Number,
	updatedAt: Schema.Number,
});

const GitHubCheckRunSchema = Schema.Struct({
	repositoryId: Schema.Number,
	githubCheckRunId: Schema.Number,
	name: Schema.String,
	headSha: Schema.String,
	status: Schema.String,
	conclusion: Schema.NullOr(Schema.String),
	startedAt: Schema.NullOr(Schema.Number),
	completedAt: Schema.NullOr(Schema.Number),
});

// ============================================================
// C) UI Read Projection Tables
// ============================================================

const ViewRepoOverviewSchema = Schema.Struct({
	repositoryId: Schema.Number,
	fullName: Schema.String,
	ownerLogin: Schema.String,
	name: Schema.String,
	openPrCount: Schema.Number,
	openIssueCount: Schema.Number,
	failingCheckCount: Schema.Number,
	lastPushAt: Schema.NullOr(Schema.Number),
	syncLagSeconds: Schema.NullOr(Schema.Number),
	updatedAt: Schema.Number,
});

const ViewRepoPullRequestListSchema = Schema.Struct({
	repositoryId: Schema.Number,
	githubPrId: Schema.Number,
	number: Schema.Number,
	state: Schema.Literal("open", "closed"),
	draft: Schema.Boolean,
	title: Schema.String,
	authorLogin: Schema.NullOr(Schema.String),
	authorAvatarUrl: Schema.NullOr(Schema.String),
	headRefName: Schema.String,
	baseRefName: Schema.String,
	commentCount: Schema.Number,
	reviewCount: Schema.Number,
	lastCheckConclusion: Schema.NullOr(Schema.String),
	githubUpdatedAt: Schema.Number,
	sortUpdated: Schema.Number,
});

const ViewRepoIssueListSchema = Schema.Struct({
	repositoryId: Schema.Number,
	githubIssueId: Schema.Number,
	number: Schema.Number,
	state: Schema.Literal("open", "closed"),
	title: Schema.String,
	authorLogin: Schema.NullOr(Schema.String),
	authorAvatarUrl: Schema.NullOr(Schema.String),
	labelNames: Schema.Array(Schema.String),
	commentCount: Schema.Number,
	githubUpdatedAt: Schema.Number,
	sortUpdated: Schema.Number,
});

const ViewActivityFeedSchema = Schema.Struct({
	repositoryId: Schema.Number,
	installationId: Schema.Number,
	activityType: Schema.String,
	title: Schema.String,
	description: Schema.NullOr(Schema.String),
	actorLogin: Schema.NullOr(Schema.String),
	actorAvatarUrl: Schema.NullOr(Schema.String),
	entityNumber: Schema.NullOr(Schema.Number),
	createdAt: Schema.Number,
});

// ============================================================
// Schema Definition
// ============================================================

export const confectSchema = defineSchema({
	// A) Control + Ingestion
	github_installations: defineTable(GitHubInstallationSchema)
		.index("by_installationId", ["installationId"])
		.index("by_accountLogin", ["accountLogin"]),

	github_sync_jobs: defineTable(GitHubSyncJobSchema)
		.index("by_lockKey", ["lockKey"])
		.index("by_state_and_nextRunAt", ["state", "nextRunAt"])
		.index("by_scopeType_and_installationId", ["scopeType", "installationId"]),

	github_sync_cursors: defineTable(GitHubSyncCursorSchema).index(
		"by_cursorKey",
		["cursorKey"],
	),

	github_webhook_events_raw: defineTable(GitHubWebhookEventRawSchema)
		.index("by_deliveryId", ["deliveryId"])
		.index("by_processState_and_receivedAt", ["processState", "receivedAt"])
		.index("by_installationId_and_receivedAt", [
			"installationId",
			"receivedAt",
		]),

	github_dead_letters: defineTable(GitHubDeadLetterSchema).index(
		"by_createdAt",
		["createdAt"],
	),

	// B) Normalized Domain
	github_users: defineTable(GitHubUserSchema)
		.index("by_githubUserId", ["githubUserId"])
		.index("by_login", ["login"]),

	github_organizations: defineTable(GitHubOrganizationSchema)
		.index("by_githubOrgId", ["githubOrgId"])
		.index("by_login", ["login"]),

	github_repositories: defineTable(GitHubRepositorySchema)
		.index("by_githubRepoId", ["githubRepoId"])
		.index("by_installationId_and_fullName", ["installationId", "fullName"])
		.index("by_ownerLogin_and_name", ["ownerLogin", "name"])
		.index("by_installationId_and_githubUpdatedAt", [
			"installationId",
			"githubUpdatedAt",
		]),

	github_branches: defineTable(GitHubBranchSchema)
		.index("by_repositoryId_and_name", ["repositoryId", "name"])
		.index("by_repositoryId_and_headSha", ["repositoryId", "headSha"]),

	github_commits: defineTable(GitHubCommitSchema)
		.index("by_repositoryId_and_sha", ["repositoryId", "sha"])
		.index("by_repositoryId_and_committedAt", ["repositoryId", "committedAt"]),

	github_pull_requests: defineTable(GitHubPullRequestSchema)
		.index("by_repositoryId_and_number", ["repositoryId", "number"])
		.index("by_repositoryId_and_state_and_githubUpdatedAt", [
			"repositoryId",
			"state",
			"githubUpdatedAt",
		])
		.index("by_repositoryId_and_headSha", ["repositoryId", "headSha"]),

	github_pull_request_reviews: defineTable(GitHubPullRequestReviewSchema)
		.index("by_repositoryId_and_pullRequestNumber", [
			"repositoryId",
			"pullRequestNumber",
		])
		.index("by_repositoryId_and_githubReviewId", [
			"repositoryId",
			"githubReviewId",
		]),

	github_issues: defineTable(GitHubIssueSchema)
		.index("by_repositoryId_and_number", ["repositoryId", "number"])
		.index("by_repositoryId_and_state_and_githubUpdatedAt", [
			"repositoryId",
			"state",
			"githubUpdatedAt",
		]),

	github_issue_comments: defineTable(GitHubIssueCommentSchema)
		.index("by_repositoryId_and_issueNumber", ["repositoryId", "issueNumber"])
		.index("by_repositoryId_and_githubCommentId", [
			"repositoryId",
			"githubCommentId",
		]),

	github_check_runs: defineTable(GitHubCheckRunSchema)
		.index("by_repositoryId_and_githubCheckRunId", [
			"repositoryId",
			"githubCheckRunId",
		])
		.index("by_repositoryId_and_headSha", ["repositoryId", "headSha"]),

	// C) UI Read Projections
	view_repo_overview: defineTable(ViewRepoOverviewSchema).index(
		"by_repositoryId",
		["repositoryId"],
	),

	view_repo_pull_request_list: defineTable(ViewRepoPullRequestListSchema).index(
		"by_repositoryId_and_sortUpdated",
		["repositoryId", "sortUpdated"],
	),

	view_repo_issue_list: defineTable(ViewRepoIssueListSchema).index(
		"by_repositoryId_and_sortUpdated",
		["repositoryId", "sortUpdated"],
	),

	view_activity_feed: defineTable(ViewActivityFeedSchema)
		.index("by_repositoryId_and_createdAt", ["repositoryId", "createdAt"])
		.index("by_installationId_and_createdAt", ["installationId", "createdAt"]),
});

export default confectSchema.convexSchemaDefinition;

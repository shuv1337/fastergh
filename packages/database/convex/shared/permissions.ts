import { Context, Data, Effect, Option, Schema } from "effect";
import { ConfectMutationCtx, ConfectQueryCtx } from "../confect";

// ---------------------------------------------------------------------------
// Permission Level
// ---------------------------------------------------------------------------

export const RepoPermissionLevelSchema = Schema.Literal(
	"pull",
	"triage",
	"push",
	"maintain",
	"admin",
);

/**
 * GitHub permission levels, ordered from least to most privileged.
 * Each level is cumulative — e.g. "push" implies "triage" and "pull".
 */
export type GitHubPermissionLevel = Schema.Schema.Type<
	typeof RepoPermissionLevelSchema
>;

type RepoPermissionRowFlags = {
	readonly pull: boolean;
	readonly triage: boolean;
	readonly push: boolean;
	readonly maintain: boolean;
	readonly admin: boolean;
};

type PermissionLookupDb = ConfectQueryCtx["db"] | ConfectMutationCtx["db"];

type EvaluateRepoPermissionParams = {
	readonly repositoryId: number;
	readonly isPrivate: boolean;
	readonly userId: string | null;
	readonly required: GitHubPermissionLevel;
	readonly requireAuthenticated?: boolean;
};

export type RepoPermissionDecision = {
	readonly isAllowed: boolean;
	readonly reason: "allowed" | "not_authenticated" | "insufficient_permission";
	readonly required: GitHubPermissionLevel;
	readonly actual: GitHubPermissionLevel | null;
	readonly repositoryId: number;
	readonly userId: string | null;
};

/**
 * Numeric rank for each permission level.
 * Higher rank means more privilege.
 */
const PERMISSION_RANK: Record<GitHubPermissionLevel, number> = {
	pull: 0,
	triage: 1,
	push: 2,
	maintain: 3,
	admin: 4,
};

/**
 * Determine the highest permission level from the boolean flags.
 * Returns the most privileged level that is `true`, or `null`
 * if none are set.
 */
const highestPermissionFromFlags = (
	flags: RepoPermissionRowFlags,
): GitHubPermissionLevel | null => {
	if (flags.admin) return "admin";
	if (flags.maintain) return "maintain";
	if (flags.push) return "push";
	if (flags.triage) return "triage";
	if (flags.pull) return "pull";
	return null;
};

/**
 * Returns true when `actual` is at least as privileged as `required`.
 */
const meetsRequirement = (
	actual: GitHubPermissionLevel,
	required: GitHubPermissionLevel,
) => PERMISSION_RANK[actual] >= PERMISSION_RANK[required];

const getPermissionRow = (
	db: PermissionLookupDb,
	userId: string,
	repositoryId: number,
) =>
	db
		.query("github_user_repo_permissions")
		.withIndex("by_userId_and_repositoryId", (q) =>
			q.eq("userId", userId).eq("repositoryId", repositoryId),
		)
		.first();

const allowDecision = (
	params: EvaluateRepoPermissionParams,
	actual: GitHubPermissionLevel,
): RepoPermissionDecision => ({
	isAllowed: true,
	reason: "allowed",
	required: params.required,
	actual,
	repositoryId: params.repositoryId,
	userId: params.userId,
});

const denyNotAuthenticatedDecision = (
	params: EvaluateRepoPermissionParams,
): RepoPermissionDecision => ({
	isAllowed: false,
	reason: "not_authenticated",
	required: params.required,
	actual: null,
	repositoryId: params.repositoryId,
	userId: params.userId,
});

const denyInsufficientPermissionDecision = (
	params: EvaluateRepoPermissionParams,
	actual: GitHubPermissionLevel | null,
): RepoPermissionDecision => ({
	isAllowed: false,
	reason: "insufficient_permission",
	required: params.required,
	actual,
	repositoryId: params.repositoryId,
	userId: params.userId,
});

/**
 * Canonical permission evaluator used by all repository access checks.
 *
 * Rules:
 * - `requireAuthenticated` denies anonymous access even for public pull.
 * - Public repos implicitly grant `pull`.
 * - `triage+` always requires an authenticated user with explicit row flags.
 */
export const evaluateRepoPermissionWithDb = (
	db: PermissionLookupDb,
	params: EvaluateRepoPermissionParams,
) =>
	Effect.gen(function* () {
		const requireAuthenticated = params.requireAuthenticated ?? false;

		if (requireAuthenticated && params.userId === null) {
			return denyNotAuthenticatedDecision(params);
		}

		if (params.userId === null) {
			if (!params.isPrivate && meetsRequirement("pull", params.required)) {
				return allowDecision(params, "pull");
			}

			return denyNotAuthenticatedDecision(params);
		}

		const permission = yield* getPermissionRow(
			db,
			params.userId,
			params.repositoryId,
		);

		if (Option.isSome(permission)) {
			const actual = highestPermissionFromFlags(permission.value);
			if (actual !== null && meetsRequirement(actual, params.required)) {
				return allowDecision(params, actual);
			}

			return denyInsufficientPermissionDecision(params, actual);
		}

		if (!params.isPrivate && meetsRequirement("pull", params.required)) {
			return allowDecision(params, "pull");
		}

		return denyInsufficientPermissionDecision(params, null);
	});

export const evaluateRepoPermission = (params: EvaluateRepoPermissionParams) =>
	Effect.gen(function* () {
		const ctx = yield* ConfectQueryCtx;
		return yield* evaluateRepoPermissionWithDb(ctx.db, params);
	});

export const evaluateRepoPermissionForMutation = (
	params: EvaluateRepoPermissionParams,
) =>
	Effect.gen(function* () {
		const ctx = yield* ConfectMutationCtx;
		return yield* evaluateRepoPermissionWithDb(ctx.db, params);
	});

export const hasRepositoryPermissionWithDb = (
	db: PermissionLookupDb,
	params: EvaluateRepoPermissionParams,
) =>
	evaluateRepoPermissionWithDb(db, params).pipe(
		Effect.map((decision) => decision.isAllowed),
	);

export const hasRepositoryPermission = (params: EvaluateRepoPermissionParams) =>
	evaluateRepoPermission(params).pipe(
		Effect.map((decision) => decision.isAllowed),
	);

export const hasRepositoryPermissionForMutation = (
	params: EvaluateRepoPermissionParams,
) =>
	evaluateRepoPermissionForMutation(params).pipe(
		Effect.map((decision) => decision.isAllowed),
	);

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InsufficientPermissionError extends Data.TaggedError(
	"InsufficientPermissionError",
)<{
	readonly userId: string;
	readonly repositoryId: number;
	readonly required: GitHubPermissionLevel;
	readonly actual: GitHubPermissionLevel | null;
}> {}

export class NotAuthenticatedError extends Data.TaggedError(
	"NotAuthenticatedError",
)<{
	readonly reason: string;
}> {}

// ---------------------------------------------------------------------------
// Permission proof types
// ---------------------------------------------------------------------------

/**
 * A proof value carried in the Effect context after a permission check
 * succeeds. The shape is the same for every access level — the *tag*
 * distinguishes the required level.
 */
interface RepoAccessProof {
	readonly userId: string;
	readonly repositoryId: number;
}

export class RepoPullAccess extends Context.Tag("@quickhub/RepoPullAccess")<
	RepoPullAccess,
	RepoAccessProof
>() {}

export class RepoTriageAccess extends Context.Tag("@quickhub/RepoTriageAccess")<
	RepoTriageAccess,
	RepoAccessProof
>() {}

export class RepoPushAccess extends Context.Tag("@quickhub/RepoPushAccess")<
	RepoPushAccess,
	RepoAccessProof
>() {}

export class RepoMaintainAccess extends Context.Tag(
	"@quickhub/RepoMaintainAccess",
)<RepoMaintainAccess, RepoAccessProof>() {}

export class RepoAdminAccess extends Context.Tag("@quickhub/RepoAdminAccess")<
	RepoAdminAccess,
	RepoAccessProof
>() {}

// ---------------------------------------------------------------------------
// Core verification
// ---------------------------------------------------------------------------

/**
 * Verify that `userId` has at least `required` permission on the given repo.
 *
 * For **public** repositories the function grants implicit `pull` access to
 * every authenticated user (even without a row in the permissions table).
 *
 * Returns the user's actual permission level on success, or fails with
 * `InsufficientPermissionError`.
 */
export const verifyRepoPermission = (
	userId: string,
	repositoryId: number,
	required: GitHubPermissionLevel,
) =>
	Effect.gen(function* () {
		const ctx = yield* ConfectQueryCtx;
		const repo = yield* ctx.db
			.query("github_repositories")
			.withIndex("by_githubRepoId", (q) => q.eq("githubRepoId", repositoryId))
			.first();

		const isPrivate = Option.isSome(repo) ? repo.value.private : true;
		const decision = yield* evaluateRepoPermissionWithDb(ctx.db, {
			repositoryId,
			isPrivate,
			userId,
			required,
		});

		if (decision.isAllowed && decision.actual !== null) {
			return decision.actual;
		}

		return yield* new InsufficientPermissionError({
			userId,
			repositoryId,
			required,
			actual: decision.actual,
		});
	});

// ---------------------------------------------------------------------------
// Convenience – require* helpers
// ---------------------------------------------------------------------------

/**
 * Require at least `pull` (read) access. Returns a proof value suitable
 * for `Effect.provideService(RepoPullAccess, proof)`.
 */
export const requirePullAccess = (userId: string, repositoryId: number) =>
	Effect.gen(function* () {
		yield* verifyRepoPermission(userId, repositoryId, "pull");
		return { userId, repositoryId } satisfies RepoAccessProof;
	});

/**
 * Require at least `triage` access.
 */
export const requireTriageAccess = (userId: string, repositoryId: number) =>
	Effect.gen(function* () {
		yield* verifyRepoPermission(userId, repositoryId, "triage");
		return { userId, repositoryId } satisfies RepoAccessProof;
	});

/**
 * Require at least `push` (write) access.
 */
export const requirePushAccess = (userId: string, repositoryId: number) =>
	Effect.gen(function* () {
		yield* verifyRepoPermission(userId, repositoryId, "push");
		return { userId, repositoryId } satisfies RepoAccessProof;
	});

/**
 * Require at least `maintain` access.
 */
export const requireMaintainAccess = (userId: string, repositoryId: number) =>
	Effect.gen(function* () {
		yield* verifyRepoPermission(userId, repositoryId, "maintain");
		return { userId, repositoryId } satisfies RepoAccessProof;
	});

/**
 * Require `admin` access.
 */
export const requireAdminAccess = (userId: string, repositoryId: number) =>
	Effect.gen(function* () {
		yield* verifyRepoPermission(userId, repositoryId, "admin");
		return { userId, repositoryId } satisfies RepoAccessProof;
	});

// ---------------------------------------------------------------------------
// Mutation-context variants
// ---------------------------------------------------------------------------

/**
 * verifyRepoPermission equivalent that runs in mutation context.
 */
export const verifyRepoPermissionForMutation = (
	userId: string,
	repositoryId: number,
	required: GitHubPermissionLevel,
) =>
	Effect.gen(function* () {
		const ctx = yield* ConfectMutationCtx;
		const repo = yield* ctx.db
			.query("github_repositories")
			.withIndex("by_githubRepoId", (q) => q.eq("githubRepoId", repositoryId))
			.first();

		const isPrivate = Option.isSome(repo) ? repo.value.private : true;
		const decision = yield* evaluateRepoPermissionWithDb(ctx.db, {
			repositoryId,
			isPrivate,
			userId,
			required,
		});

		if (decision.isAllowed && decision.actual !== null) {
			return decision.actual;
		}

		return yield* new InsufficientPermissionError({
			userId,
			repositoryId,
			required,
			actual: decision.actual,
		});
	});

export const requireTriageAccessForMutation = (
	userId: string,
	repositoryId: number,
) =>
	Effect.gen(function* () {
		yield* verifyRepoPermissionForMutation(userId, repositoryId, "triage");
		return { userId, repositoryId } satisfies RepoAccessProof;
	});

export const requirePushAccessForMutation = (
	userId: string,
	repositoryId: number,
) =>
	Effect.gen(function* () {
		yield* verifyRepoPermissionForMutation(userId, repositoryId, "push");
		return { userId, repositoryId } satisfies RepoAccessProof;
	});

// ---------------------------------------------------------------------------
// Main entry point — resolveRepoAccess
// ---------------------------------------------------------------------------

/**
 * Resolve the current user's access level for a repository.
 *
 * This is the primary entry point for query-level access checks:
 *
 * - **Public repo, unauthenticated user** → grants `pull` access
 * - **Public repo, authenticated user** → checks permissions table,
 *   falls back to implicit `pull`
 * - **Private repo, unauthenticated user** → fails with `NotAuthenticatedError`
 * - **Private repo, authenticated user** → checks permissions table
 *
 * Returns a `RepoAccessProof` with the resolved `userId` (or `"anonymous"`
 * for unauthenticated public access) and the repository ID.
 */
export const resolveRepoAccess = (repositoryId: number, isPrivate: boolean) =>
	Effect.gen(function* () {
		const ctx = yield* ConfectQueryCtx;
		const identity = yield* ctx.auth.getUserIdentity();

		const userId = Option.isSome(identity) ? identity.value.subject : null;
		const decision = yield* evaluateRepoPermissionWithDb(ctx.db, {
			repositoryId,
			isPrivate,
			userId,
			required: "pull",
		});

		if (!decision.isAllowed) {
			if (decision.reason === "not_authenticated") {
				return yield* new NotAuthenticatedError({
					reason: "Authentication required to access private repositories",
				});
			}

			return yield* new InsufficientPermissionError({
				userId: decision.userId ?? "anonymous",
				repositoryId,
				required: "pull",
				actual: decision.actual,
			});
		}

		if (decision.actual === null) {
			return yield* new InsufficientPermissionError({
				userId: decision.userId ?? "anonymous",
				repositoryId,
				required: "pull",
				actual: null,
			});
		}

		return {
			userId: decision.userId ?? "anonymous",
			repositoryId,
			level: decision.actual,
		};
	});

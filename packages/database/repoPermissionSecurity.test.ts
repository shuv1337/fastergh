import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { api, internal } from "./convex/_generated/api";
import { createConvexTest } from "./testing";

type ExitEnvelope<T> =
	| {
			_tag: "Success";
			value: T;
	  }
	| {
			_tag: string;
			cause?: string | number | boolean | null | object;
	  };

const readSuccessValue = <T>(result: ExitEnvelope<T>): T => {
	if (result._tag !== "Success") {
		throw new Error(
			`Expected Success, got ${result._tag}: ${String(result.cause)}`,
		);
	}

	return result.value;
};

const readSuccessBoolean = (result: ExitEnvelope<boolean>): boolean => {
	const value = readSuccessValue(result);
	if (typeof value !== "boolean") {
		throw new Error("Expected Success value to be boolean");
	}
	return value;
};

const readSuccessArray = (
	result: ExitEnvelope<Array<object>>,
): Array<object> => {
	const value = readSuccessValue(result);
	if (!Array.isArray(value)) {
		throw new Error("Expected Success value to be an array");
	}
	return value;
};

const seedRepo = (
	t: ReturnType<typeof createConvexTest>,
	args: {
		repositoryId: number;
		ownerLogin: string;
		name: string;
		isPrivate: boolean;
	},
) =>
	Effect.promise(() =>
		t.run(async (ctx) => {
			const now = Date.now();
			await ctx.db.insert("github_repositories", {
				githubRepoId: args.repositoryId,
				installationId: 0,
				ownerId: 100,
				ownerLogin: args.ownerLogin,
				name: args.name,
				fullName: `${args.ownerLogin}/${args.name}`,
				private: args.isPrivate,
				visibility: args.isPrivate ? "private" : "public",
				defaultBranch: "main",
				archived: false,
				disabled: false,
				fork: false,
				pushedAt: null,
				githubUpdatedAt: now,
				cachedAt: now,
				connectedByUserId: null,
				stargazersCount: 0,
			});
		}),
	);

const seedPermission = (
	t: ReturnType<typeof createConvexTest>,
	args: {
		userId: string;
		repositoryId: number;
		pull: boolean;
		triage: boolean;
		push: boolean;
		maintain: boolean;
		admin: boolean;
		syncedAt: number;
	},
) =>
	Effect.promise(() =>
		t.run(async (ctx) => {
			await ctx.db.insert("github_user_repo_permissions", {
				userId: args.userId,
				repositoryId: args.repositoryId,
				githubUserId: 999,
				pull: args.pull,
				triage: args.triage,
				push: args.push,
				maintain: args.maintain,
				admin: args.admin,
				roleName: null,
				syncedAt: args.syncedAt,
			});
		}),
	);

const seedTemplate = (
	t: ReturnType<typeof createConvexTest>,
	repositoryId: number,
) =>
	Effect.promise(() =>
		t.run(async (ctx) => {
			await ctx.db.insert("github_issue_template_cache", {
				repositoryId,
				filename: "bug_report.md",
				name: "Bug report",
				description: "File a bug",
				title: null,
				body: "Steps to reproduce",
				labels: ["bug"],
				assignees: [],
				cachedAt: Date.now(),
			});
		}),
	);

describe("Repository Permission Security", () => {
	it.effect(
		"enforces public/private permission matrix via canonical query",
		() =>
			Effect.gen(function* () {
				const t = createConvexTest();
				const publicRepoId = 101;
				const privateRepoId = 202;
				const userId = "viewer-1";

				yield* seedRepo(t, {
					repositoryId: publicRepoId,
					ownerLogin: "open-org",
					name: "open-repo",
					isPrivate: false,
				});
				yield* seedRepo(t, {
					repositoryId: privateRepoId,
					ownerLogin: "closed-org",
					name: "closed-repo",
					isPrivate: true,
				});

				const runHasPermission = (args: {
					repositoryId: number;
					isPrivate: boolean;
					userId: string | null;
					required: "pull" | "triage" | "push" | "maintain" | "admin";
					requireAuthenticated?: boolean;
				}) =>
					Effect.promise(() =>
						t.query(internal.rpc.codeBrowse.hasRepoPermission, args),
					).pipe(Effect.map(readSuccessBoolean));

				expect(
					yield* runHasPermission({
						repositoryId: publicRepoId,
						isPrivate: false,
						userId: null,
						required: "pull",
					}),
				).toBe(true);

				expect(
					yield* runHasPermission({
						repositoryId: publicRepoId,
						isPrivate: false,
						userId: null,
						required: "triage",
					}),
				).toBe(false);

				expect(
					yield* runHasPermission({
						repositoryId: privateRepoId,
						isPrivate: true,
						userId: null,
						required: "pull",
					}),
				).toBe(false);

				expect(
					yield* runHasPermission({
						repositoryId: publicRepoId,
						isPrivate: false,
						userId: null,
						required: "pull",
						requireAuthenticated: true,
					}),
				).toBe(false);

				yield* seedPermission(t, {
					userId,
					repositoryId: privateRepoId,
					pull: true,
					triage: true,
					push: false,
					maintain: false,
					admin: false,
					syncedAt: Date.now(),
				});

				expect(
					yield* runHasPermission({
						repositoryId: privateRepoId,
						isPrivate: true,
						userId,
						required: "pull",
					}),
				).toBe(true);

				expect(
					yield* runHasPermission({
						repositoryId: privateRepoId,
						isPrivate: true,
						userId,
						required: "triage",
					}),
				).toBe(true);

				expect(
					yield* runHasPermission({
						repositoryId: privateRepoId,
						isPrivate: true,
						userId,
						required: "push",
					}),
				).toBe(false);
			}),
	);

	it.effect(
		"keeps signed-out access for public repos via read middleware",
		() =>
			Effect.gen(function* () {
				const t = createConvexTest();
				const publicRepoId = 303;
				const privateRepoId = 404;

				yield* seedRepo(t, {
					repositoryId: publicRepoId,
					ownerLogin: "open-org",
					name: "docs",
					isPrivate: false,
				});
				yield* seedTemplate(t, publicRepoId);

				const anonymousPublicResult = yield* Effect.promise(() =>
					t.query(api.rpc.issueTemplates.getCachedTemplates, {
						ownerLogin: "open-org",
						name: "docs",
					}),
				);
				expect(readSuccessArray(anonymousPublicResult)).toHaveLength(1);

				yield* seedRepo(t, {
					repositoryId: privateRepoId,
					ownerLogin: "closed-org",
					name: "internal-docs",
					isPrivate: true,
				});
				yield* seedTemplate(t, privateRepoId);

				const anonymousPrivateResult = yield* Effect.promise(() =>
					t.query(api.rpc.issueTemplates.getCachedTemplates, {
						ownerLogin: "closed-org",
						name: "internal-docs",
					}),
				);
				expect(readSuccessArray(anonymousPrivateResult)).toHaveLength(0);

				yield* seedPermission(t, {
					userId: "viewer-2",
					repositoryId: privateRepoId,
					pull: true,
					triage: false,
					push: false,
					maintain: false,
					admin: false,
					syncedAt: Date.now(),
				});

				const signedInClient = t.withIdentity({ subject: "viewer-2" });
				const signedInPrivateResult = yield* Effect.promise(() =>
					signedInClient.query(api.rpc.issueTemplates.getCachedTemplates, {
						ownerLogin: "closed-org",
						name: "internal-docs",
					}),
				);
				expect(readSuccessArray(signedInPrivateResult)).toHaveLength(1);
			}),
	);

	it.effect("documents stale-row behavior and revocation semantics", () =>
		Effect.gen(function* () {
			const t = createConvexTest();
			const repositoryId = 505;
			const userId = "viewer-3";

			yield* seedRepo(t, {
				repositoryId,
				ownerLogin: "closed-org",
				name: "compliance-repo",
				isPrivate: true,
			});

			// Old syncedAt timestamps still grant access until a fresh sync updates/removes rows.
			yield* seedPermission(t, {
				userId,
				repositoryId,
				pull: true,
				triage: true,
				push: false,
				maintain: false,
				admin: false,
				syncedAt: Date.now() - 1000 * 60 * 60 * 24 * 30,
			});

			const beforeRevocation = yield* Effect.promise(() =>
				t.query(internal.rpc.codeBrowse.hasRepoPermission, {
					repositoryId,
					isPrivate: true,
					userId,
					required: "triage",
				}),
			);
			expect(readSuccessBoolean(beforeRevocation)).toBe(true);

			yield* Effect.promise(() =>
				t.run(async (ctx) => {
					const existing = await ctx.db
						.query("github_user_repo_permissions")
						.withIndex("by_userId_and_repositoryId", (q) =>
							q.eq("userId", userId).eq("repositoryId", repositoryId),
						)
						.first();

					if (existing !== null) {
						await ctx.db.delete(existing._id);
					}
				}),
			);

			const afterRevocation = yield* Effect.promise(() =>
				t.query(internal.rpc.codeBrowse.hasRepoPermission, {
					repositoryId,
					isPrivate: true,
					userId,
					required: "triage",
				}),
			);
			expect(readSuccessBoolean(afterRevocation)).toBe(false);

			yield* Effect.promise(() =>
				t.run(async (ctx) => {
					const repo = await ctx.db
						.query("github_repositories")
						.withIndex("by_githubRepoId", (q) =>
							q.eq("githubRepoId", repositoryId),
						)
						.first();

					if (repo !== null) {
						await ctx.db.patch(repo._id, {
							private: false,
							visibility: "public",
						});
					}
				}),
			);

			const publicFallback = yield* Effect.promise(() =>
				t.query(internal.rpc.codeBrowse.hasRepoPermission, {
					repositoryId,
					isPrivate: false,
					userId: null,
					required: "pull",
				}),
			);
			expect(readSuccessBoolean(publicFallback)).toBe(true);
		}),
	);
});

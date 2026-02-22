"use client";

import { useSubscriptionWithInitial } from "@packages/confect/rpc";
import { Badge } from "@packages/ui/components/badge";
import {
	ArrowRight,
	CircleDot,
	GitPullRequest,
	MessageCircle,
} from "@packages/ui/components/icons";
import { Link } from "@packages/ui/components/link";
import { useProjectionQueries } from "@packages/ui/rpc/projection-queries";
import { useMemo } from "react";
import { InstallGitHubAppButton } from "../../../_components/install-github-app-button";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function formatRelative(timestamp: number): string {
	const diff = Math.floor((Date.now() - timestamp) / 1000);
	if (diff < 60) return "just now";
	if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
	if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
	if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
	return new Date(timestamp).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

// ---------------------------------------------------------------------------
// RepoOverviewHeader — header + stats cards (uses getRepoOverview)
// ---------------------------------------------------------------------------

export type RepoOverview = {
	readonly repositoryId: number;
	readonly fullName: string;
	readonly ownerLogin: string;
	readonly name: string;
	readonly openPrCount: number;
	readonly openIssueCount: number;
	readonly failingCheckCount: number;
	readonly lastPushAt: number | null;
	readonly updatedAt: number;
};

export function RepoOverviewHeader({
	owner,
	name,
	initialOverview,
}: {
	owner: string;
	name: string;
	initialOverview: RepoOverview | null;
}) {
	const client = useProjectionQueries();
	const overviewAtom = useMemo(
		() =>
			client.getRepoOverview.subscription({
				ownerLogin: owner,
				name,
			}),
		[client, owner, name],
	);
	const overview = useSubscriptionWithInitial(overviewAtom, initialOverview);

	if (overview === null) {
		return (
			<div className="flex items-center justify-center px-6 py-12">
				<div className="w-full max-w-md rounded-xl border bg-card p-6 text-center">
					<h1 className="text-lg font-semibold text-foreground">
						{owner}/{name}
					</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						This repository is not synced yet.
					</p>
					<p className="mt-1 text-xs text-muted-foreground">
						Install the GitHub App for {owner} to start syncing this repo.
					</p>
					<InstallGitHubAppButton className="mt-4" />
				</div>
			</div>
		);
	}

	return (
		<>
			{/* Repo header */}
			<div className="mb-6">
				<h1 className="text-lg font-bold tracking-tight text-foreground">
					{owner}/{name}
				</h1>
				{overview.lastPushAt && (
					<p className="text-[11px] text-muted-foreground mt-0.5">
						Last pushed {formatRelative(overview.lastPushAt)}
					</p>
				)}
			</div>

			{/* Quick stats */}
			<div className="grid grid-cols-2 gap-3 mb-6">
				<Link
					href={`/${owner}/${name}/pulls`}
					prefetchKey="repo.pulls"
					prefetchParams={{ owner, name }}
					className="rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted no-underline group"
				>
					<div className="flex items-center gap-1.5 mb-1">
						<GitPullRequest className="size-3 text-github-open" />
						<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
							PRs
						</span>
					</div>
					<p className="text-xl font-bold tabular-nums text-foreground">
						{overview.openPrCount}
					</p>
				</Link>
				<Link
					href={`/${owner}/${name}/issues`}
					prefetchKey="repo.issues"
					prefetchParams={{ owner, name }}
					className="rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted no-underline group"
				>
					<div className="flex items-center gap-1.5 mb-1">
						<CircleDot className="size-3 text-github-info" />
						<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
							Issues
						</span>
					</div>
					<p className="text-xl font-bold tabular-nums text-foreground">
						{overview.openIssueCount}
					</p>
				</Link>
			</div>
		</>
	);
}

// ---------------------------------------------------------------------------
// RecentPrsPanel — list of up to 5 open PRs (uses listPullRequests)
// ---------------------------------------------------------------------------

type PrItem = {
	readonly number: number;
	readonly state: "open" | "closed";
	readonly optimisticState: "pending" | "failed" | "confirmed" | null;
	readonly optimisticErrorMessage: string | null;
	readonly draft: boolean;
	readonly title: string;
	readonly authorLogin: string | null;
	readonly authorAvatarUrl: string | null;
	readonly headRefName: string;
	readonly baseRefName: string;
	readonly commentCount: number;
	readonly reviewCount: number;
	readonly lastCheckConclusion: string | null;
	readonly githubUpdatedAt: number;
};

export function RecentPrsPanel({
	owner,
	name,
	initialPrs,
}: {
	owner: string;
	name: string;
	initialPrs: ReadonlyArray<PrItem>;
}) {
	const client = useProjectionQueries();
	const prsAtom = useMemo(
		() =>
			client.listPullRequests.subscription({
				ownerLogin: owner,
				name,
				state: "open",
			}),
		[client, owner, name],
	);
	const prs = useSubscriptionWithInitial(prsAtom, initialPrs);

	if (prs.length === 0) return null;

	return (
		<div className="mb-6">
			<div className="flex items-center justify-between mb-2">
				<div className="flex items-center gap-1.5">
					<GitPullRequest className="size-3.5 text-github-open" />
					<h2 className="text-xs font-semibold text-foreground">
						Open Pull Requests
					</h2>
				</div>
				<Link
					href={`/${owner}/${name}/pulls`}
					prefetchKey="repo.pulls"
					prefetchParams={{ owner, name }}
					className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground no-underline transition-colors"
				>
					View all
					<ArrowRight className="size-2.5" />
				</Link>
			</div>
			<div className="divide-y rounded-lg border">
				{prs.slice(0, 5).map((pr) => (
					<Link
						key={pr.number}
						href={`/${owner}/${name}/pull/${pr.number}`}
						prefetchKey="repo.pull"
						prefetchParams={{ owner, name, number: pr.number }}
						className="flex items-start gap-2 px-3 py-2 transition-colors hover:bg-muted no-underline"
					>
						<PrStateIcon state={pr.state} draft={pr.draft} />
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-1.5">
								<span className="font-medium text-xs truncate text-foreground">
									{pr.title}
								</span>
								{pr.draft && (
									<Badge
										variant="outline"
										className="text-[9px] px-1 py-0 shrink-0"
									>
										Draft
									</Badge>
								)}
							</div>
							<div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
								<span>#{pr.number}</span>
								{pr.authorLogin && <span>{pr.authorLogin}</span>}
								<span>{formatRelative(pr.githubUpdatedAt)}</span>
								{pr.commentCount > 0 && (
									<span className="flex items-center gap-0.5">
										<MessageCircle className="size-2.5" />
										{pr.commentCount}
									</span>
								)}
							</div>
						</div>
						{pr.lastCheckConclusion && (
							<CheckDot conclusion={pr.lastCheckConclusion} />
						)}
					</Link>
				))}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// RecentIssuesPanel — list of up to 5 open issues (uses listIssues)
// ---------------------------------------------------------------------------

type IssueItem = {
	readonly number: number;
	readonly state: "open" | "closed";
	readonly optimisticState: "pending" | "failed" | "confirmed" | null;
	readonly optimisticErrorMessage: string | null;
	readonly title: string;
	readonly authorLogin: string | null;
	readonly authorAvatarUrl: string | null;
	readonly labelNames: ReadonlyArray<string>;
	readonly commentCount: number;
	readonly githubUpdatedAt: number;
};

export function RecentIssuesPanel({
	owner,
	name,
	initialIssues,
}: {
	owner: string;
	name: string;
	initialIssues: ReadonlyArray<IssueItem>;
}) {
	const client = useProjectionQueries();
	const issuesAtom = useMemo(
		() =>
			client.listIssues.subscription({
				ownerLogin: owner,
				name,
				state: "open",
			}),
		[client, owner, name],
	);
	const issues = useSubscriptionWithInitial(issuesAtom, initialIssues);

	if (issues.length === 0) return null;

	return (
		<div className="mb-6">
			<div className="flex items-center justify-between mb-2">
				<div className="flex items-center gap-1.5">
					<CircleDot className="size-3.5 text-github-info" />
					<h2 className="text-xs font-semibold text-foreground">Open Issues</h2>
				</div>
				<Link
					href={`/${owner}/${name}/issues`}
					prefetchKey="repo.issues"
					prefetchParams={{ owner, name }}
					className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground no-underline transition-colors"
				>
					View all
					<ArrowRight className="size-2.5" />
				</Link>
			</div>
			<div className="divide-y rounded-lg border">
				{issues.slice(0, 5).map((issue) => (
					<Link
						key={issue.number}
						href={`/${owner}/${name}/issues/${issue.number}`}
						prefetchKey="repo.issue"
						prefetchParams={{ owner, name, number: issue.number }}
						className="flex items-start gap-2 px-3 py-2 transition-colors hover:bg-muted no-underline"
					>
						<IssueStateIcon state={issue.state} />
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-1.5">
								<span className="font-medium text-xs truncate text-foreground">
									{issue.title}
								</span>
							</div>
							<div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
								<span>#{issue.number}</span>
								{issue.authorLogin && <span>{issue.authorLogin}</span>}
								<span>{formatRelative(issue.githubUpdatedAt)}</span>
								{issue.commentCount > 0 && (
									<span className="flex items-center gap-0.5">
										<MessageCircle className="size-2.5" />
										{issue.commentCount}
									</span>
								)}
							</div>
						</div>
					</Link>
				))}
			</div>
		</div>
	);
}

// --------------------------------------------------------------------------
// Small icon components (kept local to avoid cross-file coupling)
// --------------------------------------------------------------------------

function PrStateIcon({
	state,
	draft,
}: {
	state: "open" | "closed";
	draft: boolean;
}) {
	if (draft)
		return (
			<div className="mt-0.5 size-3.5 rounded-full border-2 border-muted-foreground shrink-0" />
		);
	if (state === "open")
		return (
			<svg
				className="mt-0.5 size-3.5 text-github-open shrink-0"
				viewBox="0 0 16 16"
				fill="currentColor"
			>
				<path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354Z" />
			</svg>
		);
	return (
		<svg
			className="mt-0.5 size-3.5 text-github-merged shrink-0"
			viewBox="0 0 16 16"
			fill="currentColor"
		>
			<path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218Z" />
		</svg>
	);
}

function IssueStateIcon({ state }: { state: "open" | "closed" }) {
	if (state === "open")
		return (
			<svg
				className="mt-0.5 size-3.5 text-github-open shrink-0"
				viewBox="0 0 16 16"
				fill="currentColor"
			>
				<path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
				<path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z" />
			</svg>
		);
	return (
		<svg
			className="mt-0.5 size-3.5 text-github-merged shrink-0"
			viewBox="0 0 16 16"
			fill="currentColor"
		>
			<path d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z" />
			<path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-1.5 0a6.5 6.5 0 1 0-13 0 6.5 6.5 0 0 0 13 0Z" />
		</svg>
	);
}

function CheckDot({ conclusion }: { conclusion: string }) {
	if (conclusion === "success")
		return (
			<svg
				className="size-3 text-github-open shrink-0 mt-0.5"
				viewBox="0 0 16 16"
				fill="currentColor"
			>
				<path d="M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16Zm3.78-9.72a.751.751 0 0 0-.018-1.042.751.751 0 0 0-1.042-.018L6.75 9.19 5.28 7.72a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042l2 2a.75.75 0 0 0 1.06 0Z" />
			</svg>
		);
	if (conclusion === "failure")
		return (
			<svg
				className="size-3 text-github-closed shrink-0 mt-0.5"
				viewBox="0 0 16 16"
				fill="currentColor"
			>
				<path d="M2.343 13.657A8 8 0 1 1 13.658 2.343 8 8 0 0 1 2.343 13.657ZM6.03 4.97a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042L6.94 8 4.97 9.97a.749.749 0 0 0 .326 1.275.749.749 0 0 0 .734-.215L8 9.06l1.97 1.97a.749.749 0 0 0 1.275-.326.749.749 0 0 0-.215-.734L9.06 8l1.97-1.97a.749.749 0 0 0-.326-1.275.749.749 0 0 0-.734.215L8 6.94Z" />
			</svg>
		);
	return (
		<svg
			className="size-3 text-github-warning shrink-0 mt-0.5"
			viewBox="0 0 16 16"
			fill="currentColor"
		>
			<path d="M8 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
		</svg>
	);
}

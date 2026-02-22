"use client";

import { useSubscriptionWithInitial } from "@packages/confect/rpc";
import { Badge } from "@packages/ui/components/badge";
import { Button } from "@packages/ui/components/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandLinkItem,
	CommandList,
} from "@packages/ui/components/command";
import {
	CircleDot,
	GitBranch,
	GitPullRequest,
	MessageCircle,
	Search,
} from "@packages/ui/components/icons";
import { Link } from "@packages/ui/components/link";
import { ScrollArea } from "@packages/ui/components/scroll-area";
import { GitHubIcon } from "@packages/ui/icons/index";
import { authClient } from "@packages/ui/lib/auth-client";
import { cn } from "@packages/ui/lib/utils";
import { useProjectionQueries } from "@packages/ui/rpc/projection-queries";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { triggerOpenSearchCommand } from "../_components/search-command-events";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DashboardPrItem = {
	ownerLogin: string;
	repoName: string;
	number: number;
	state: "open" | "closed";
	draft: boolean;
	title: string;
	authorLogin: string | null;
	authorAvatarUrl: string | null;
	commentCount: number;
	lastCheckConclusion: string | null;
	failingCheckNames: readonly string[];
	githubUpdatedAt: number;
};

type DashboardIssueItem = {
	ownerLogin: string;
	repoName: string;
	number: number;
	state: "open" | "closed";
	title: string;
	authorLogin: string | null;
	authorAvatarUrl: string | null;
	labelNames: readonly string[];
	commentCount: number;
	githubUpdatedAt: number;
};

type RepoSummary = {
	ownerLogin: string;
	name: string;
	fullName: string;
	openPrCount: number;
	openIssueCount: number;
	failingCheckCount: number;
	lastPushAt: number | null;
};

export type DashboardData = {
	scope: "org" | "personal";
	rangeDays: number;
	ownerFilter: string | null;
	repoFilter: string | null;
	githubLogin: string | null;
	availableOwners: ReadonlyArray<{ ownerLogin: string; repoCount: number }>;
	availableRepos: ReadonlyArray<{
		ownerLogin: string;
		name: string;
		fullName: string;
	}>;
	summary: {
		repoCount: number;
		openPrCount: number;
		openIssueCount: number;
		failingCheckCount: number;
		attentionCount: number;
		reviewQueueCount: number;
		stalePrCount: number;
	};
	yourPrs: ReadonlyArray<DashboardPrItem>;
	needsAttentionPrs: ReadonlyArray<DashboardPrItem>;
	recentPrs: ReadonlyArray<DashboardPrItem>;
	recentIssues: ReadonlyArray<DashboardIssueItem>;
	portfolioPrs: ReadonlyArray<
		DashboardPrItem & {
			assigneeCount: number;
			requestedReviewerCount: number;
			attentionLevel: "critical" | "high" | "normal";
			attentionReason: string;
			isViewerAuthor: boolean;
			isViewerReviewer: boolean;
			isViewerAssignee: boolean;
			isStale: boolean;
		}
	>;
	recentActivity: ReadonlyArray<{
		ownerLogin: string;
		repoName: string;
		activityType: string;
		title: string;
		description: string | null;
		actorLogin: string | null;
		actorAvatarUrl: string | null;
		entityNumber: number | null;
		createdAt: number;
	}>;
	throughput: ReadonlyArray<{
		dayStart: number;
		dayLabel: string;
		closedPrCount: number;
		closedIssueCount: number;
		pushCount: number;
	}>;
	workloadByOwner: ReadonlyArray<{
		ownerLogin: string;
		openPrCount: number;
		reviewRequestedCount: number;
		failingPrCount: number;
		stalePrCount: number;
	}>;
	blockedItems: ReadonlyArray<{
		type: "ci_failure" | "stale_pr" | "review_queue";
		ownerLogin: string;
		repoName: string;
		number: number;
		title: string;
		reason: string;
		githubUpdatedAt: number;
	}>;
	repos: ReadonlyArray<RepoSummary>;
};

type DashboardQuery = {
	readonly scope?: "org" | "personal";
	readonly ownerLogin?: string;
	readonly repoFullName?: string;
	readonly days?: number;
};

// ---------------------------------------------------------------------------
// Shared hook — each section independently subscribes to the dashboard
// ---------------------------------------------------------------------------

function useDashboardData(
	initialData: DashboardData,
	query: DashboardQuery,
): DashboardData {
	const client = useProjectionQueries();
	const dashboardAtom = useMemo(
		() =>
			client.getHomeDashboard.subscription({
				scope: query.scope,
				ownerLogin: query.ownerLogin,
				repoFullName: query.repoFullName,
				days: query.days,
			}),
		[client, query.days, query.ownerLogin, query.repoFullName, query.scope],
	);
	return useSubscriptionWithInitial(dashboardAtom, initialData);
}

// ---------------------------------------------------------------------------
// Helpers
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

function dedupePrs(data: DashboardData): Array<DashboardPrItem> {
	const seen = new Set<string>();
	const result: Array<DashboardPrItem> = [];
	for (const pr of [
		...data.yourPrs,
		...data.needsAttentionPrs,
		...data.recentPrs,
	]) {
		const key = `${pr.ownerLogin}/${pr.repoName}#${pr.number}`;
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(pr);
	}
	result.sort((a, b) => b.githubUpdatedAt - a.githubUpdatedAt);
	return result;
}

// ---------------------------------------------------------------------------
// Sign-in CTA (pure client — no data dependency, just auth state)
// ---------------------------------------------------------------------------

export function SignInCta() {
	const session = authClient.useSession();

	if (session.isPending || session.data !== null) {
		return null;
	}

	return (
		<div className="mb-4 flex items-center gap-3 rounded-lg border border-dashed border-border bg-card/60 px-4 py-3">
			<GitHubIcon className="size-5 shrink-0 text-foreground/40" />
			<div className="min-w-0 flex-1">
				<p className="text-xs font-medium text-foreground">
					Sign in to see your personal feed
				</p>
				<p className="text-[11px] text-muted-foreground">
					Review requests, your PRs, and what&apos;s changed since you last
					looked.
				</p>
			</div>
			<Button
				size="sm"
				className="h-7 shrink-0 gap-1.5 text-xs"
				onClick={() => {
					authClient.signIn.social({ provider: "github" });
				}}
			>
				<GitHubIcon className="size-3" />
				Sign in
			</Button>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Command Palette
// ---------------------------------------------------------------------------

export function CommandPaletteClient({
	initialData,
	query,
}: {
	initialData: DashboardData;
	query: DashboardQuery;
}) {
	const data = useDashboardData(initialData, query);
	const allPrs = useMemo(() => dedupePrs(data), [data]);

	return (
		<DashboardCommandPalette
			repos={data.repos}
			prs={allPrs}
			issues={data.recentIssues}
			scopeOwnerLogin={query.ownerLogin ?? null}
		/>
	);
}

function DashboardCommandPalette({
	repos,
	prs,
	issues,
	scopeOwnerLogin,
}: {
	repos: ReadonlyArray<RepoSummary>;
	prs: ReadonlyArray<DashboardPrItem>;
	issues: ReadonlyArray<DashboardIssueItem>;
	scopeOwnerLogin: string | null;
}) {
	const [query, setQuery] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	// Auto-focus on mount
	useEffect(() => {
		const timeout = setTimeout(() => {
			inputRef.current?.focus();
		}, 100);
		return () => clearTimeout(timeout);
	}, []);

	const normalizedQuery = query.trim().toLowerCase();

	const filteredRepos = useMemo(() => {
		if (normalizedQuery.length === 0) return [];
		return repos
			.filter(
				(repo) =>
					repo.fullName.toLowerCase().includes(normalizedQuery) ||
					repo.name.toLowerCase().includes(normalizedQuery),
			)
			.slice(0, 5);
	}, [repos, normalizedQuery]);

	const filteredPrs = useMemo(() => {
		if (normalizedQuery.length === 0) return [];
		return prs
			.filter(
				(pr) =>
					pr.title.toLowerCase().includes(normalizedQuery) ||
					String(pr.number).includes(normalizedQuery) ||
					(pr.authorLogin?.toLowerCase().includes(normalizedQuery) ?? false),
			)
			.slice(0, 5);
	}, [prs, normalizedQuery]);

	const filteredIssues = useMemo(() => {
		if (normalizedQuery.length === 0) return [];
		return issues
			.filter(
				(issue) =>
					issue.title.toLowerCase().includes(normalizedQuery) ||
					String(issue.number).includes(normalizedQuery) ||
					(issue.authorLogin?.toLowerCase().includes(normalizedQuery) ??
						false) ||
					issue.labelNames.some((label) =>
						label.toLowerCase().includes(normalizedQuery),
					),
			)
			.slice(0, 5);
	}, [issues, normalizedQuery]);

	const hasResults =
		filteredRepos.length > 0 ||
		filteredPrs.length > 0 ||
		filteredIssues.length > 0;

	const clearQuery = useCallback(() => {
		setQuery("");
	}, []);

	const scopeLabel =
		scopeOwnerLogin === null ? "all" : `org:${scopeOwnerLogin}`;

	return (
		<>
			<Button
				variant="outline"
				className="md:hidden h-12 w-full items-center justify-start gap-2 rounded-xl border-border/70 bg-card/70 px-3 text-left shadow-sm"
				onClick={() => {
					triggerOpenSearchCommand();
				}}
			>
				<Search className="size-4 shrink-0 text-muted-foreground" />
				<div className="min-w-0 flex-1">
					<div className="truncate text-[13px] font-medium text-foreground">
						Search QuickHub
					</div>
					<div className="truncate text-[11px] text-muted-foreground">
						Repos, pull requests, issues, and actions
					</div>
				</div>
				<Badge
					variant="secondary"
					className="h-5 shrink-0 px-1.5 font-mono text-[10px]"
				>
					{scopeLabel}
				</Badge>
			</Button>

			<Command
				shouldFilter={false}
				className="hidden md:flex rounded-lg border border-border/60 bg-card/60 shadow-sm backdrop-blur-sm"
			>
				<CommandInput
					ref={inputRef}
					placeholder="Jump to a repository, pull request, or issue..."
					value={query}
					onValueChange={setQuery}
				/>
				{normalizedQuery.length > 0 && (
					<CommandList className="max-h-[260px]">
						{!hasResults && (
							<CommandEmpty>No results for &ldquo;{query}&rdquo;</CommandEmpty>
						)}
						{filteredRepos.length > 0 && (
							<CommandGroup heading="Repositories">
								{filteredRepos.map((repo) => (
									<CommandLinkItem
										key={repo.fullName}
										value={repo.fullName}
										href={`/${repo.ownerLogin}/${repo.name}`}
										prefetchKey="repo.overview"
										prefetchParams={{
											owner: repo.ownerLogin,
											name: repo.name,
										}}
										onBeforeNavigate={clearQuery}
									>
										<GitBranch className="size-3.5 text-muted-foreground" />
										<span className="flex-1 truncate text-sm">
											{repo.fullName}
										</span>
										<span className="font-mono text-[10px] text-muted-foreground/60">
											{repo.openPrCount} PRs &middot; {repo.openIssueCount}{" "}
											issues
										</span>
									</CommandLinkItem>
								))}
							</CommandGroup>
						)}
						{filteredPrs.length > 0 && (
							<CommandGroup heading="Pull Requests">
								{filteredPrs.map((pr) => (
									<CommandLinkItem
										key={`${pr.ownerLogin}/${pr.repoName}#${pr.number}`}
										value={`pr-${pr.ownerLogin}/${pr.repoName}#${pr.number}`}
										href={`/${pr.ownerLogin}/${pr.repoName}/pull/${pr.number}`}
										prefetchKey="repo.pull"
										prefetchParams={{
											owner: pr.ownerLogin,
											name: pr.repoName,
											number: pr.number,
										}}
										onBeforeNavigate={clearQuery}
									>
										<GitPullRequest className="size-3.5 text-status-open" />
										<div className="min-w-0 flex-1">
											<span className="truncate text-sm">{pr.title}</span>
											<span className="ml-2 font-mono text-[10px] text-muted-foreground/60">
												{pr.ownerLogin}/{pr.repoName} #{pr.number}
											</span>
										</div>
									</CommandLinkItem>
								))}
							</CommandGroup>
						)}
						{filteredIssues.length > 0 && (
							<CommandGroup heading="Issues">
								{filteredIssues.map((issue) => (
									<CommandLinkItem
										key={`${issue.ownerLogin}/${issue.repoName}#${issue.number}`}
										value={`issue-${issue.ownerLogin}/${issue.repoName}#${issue.number}`}
										href={`/${issue.ownerLogin}/${issue.repoName}/issues/${issue.number}`}
										prefetchKey="repo.issue"
										prefetchParams={{
											owner: issue.ownerLogin,
											name: issue.repoName,
											number: issue.number,
										}}
										onBeforeNavigate={clearQuery}
									>
										<CircleDot className="size-3.5 text-status-open" />
										<div className="min-w-0 flex-1">
											<span className="truncate text-sm">{issue.title}</span>
											<span className="ml-2 font-mono text-[10px] text-muted-foreground/60">
												{issue.ownerLogin}/{issue.repoName} #{issue.number}
											</span>
										</div>
									</CommandLinkItem>
								))}
							</CommandGroup>
						)}
					</CommandList>
				)}
			</Command>
		</>
	);
}

// ---------------------------------------------------------------------------
// Pull Requests Column
// ---------------------------------------------------------------------------

export function PrColumnClient({
	initialData,
	query,
}: {
	initialData: DashboardData;
	query: DashboardQuery;
}) {
	const data = useDashboardData(initialData, query);
	const allPrs = useMemo(() => dedupePrs(data), [data]);

	return (
		<Column
			title="Pull Requests"
			icon={<GitPullRequest className="size-3.5" />}
			count={allPrs.length}
		>
			{allPrs.length === 0 && <EmptyState>No recent pull requests.</EmptyState>}
			{allPrs.slice(0, 30).map((pr) => (
				<PrRow
					key={`${pr.ownerLogin}/${pr.repoName}#${pr.number}`}
					pr={pr}
					isOwned={pr.authorLogin === data.githubLogin}
				/>
			))}
		</Column>
	);
}

// ---------------------------------------------------------------------------
// Issues Column
// ---------------------------------------------------------------------------

export function IssuesColumnClient({
	initialData,
	query,
}: {
	initialData: DashboardData;
	query: DashboardQuery;
}) {
	const data = useDashboardData(initialData, query);

	return (
		<Column
			title="Issues"
			icon={<CircleDot className="size-3.5" />}
			count={data.recentIssues.length}
		>
			{data.recentIssues.length === 0 && (
				<EmptyState>No recent issues.</EmptyState>
			)}
			{data.recentIssues.map((issue) => (
				<IssueRow
					key={`${issue.ownerLogin}/${issue.repoName}#${issue.number}`}
					issue={issue}
				/>
			))}
		</Column>
	);
}

// ---------------------------------------------------------------------------
// Repositories Column
// ---------------------------------------------------------------------------

export function ReposColumnClient({
	initialData,
	query,
}: {
	initialData: DashboardData;
	query: DashboardQuery;
}) {
	const data = useDashboardData(initialData, query);

	return (
		<Column
			title="Repositories"
			icon={<GitBranch className="size-3.5" />}
			count={data.repos.length}
		>
			{data.repos.length === 0 && (
				<EmptyState>No repositories connected yet.</EmptyState>
			)}
			{data.repos.map((repo) => (
				<RepoRow key={repo.fullName} repo={repo} />
			))}
		</Column>
	);
}

// ---------------------------------------------------------------------------
// Column container
// ---------------------------------------------------------------------------

function Column({
	title,
	icon,
	count,
	children,
}: {
	title: string;
	icon: ReactNode;
	count: number;
	children: ReactNode;
}) {
	return (
		<section className="min-w-0">
			<div className="mb-1.5 flex items-center justify-between gap-2">
				<h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
					{icon}
					{title}
				</h2>
				{count > 0 && (
					<span className="font-mono text-[10px] text-muted-foreground/50">
						{count}
					</span>
				)}
			</div>
			<div className="overflow-hidden rounded-lg border border-border/60 bg-card/30">
				<ScrollArea className="h-[calc(100vh-220px)]">{children}</ScrollArea>
			</div>
		</section>
	);
}

function EmptyState({ children }: { children: ReactNode }) {
	return (
		<div className="px-4 py-10 text-center">
			<p className="font-mono text-[11px] text-muted-foreground/50">
				{children}
			</p>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Pull Request Row
// ---------------------------------------------------------------------------

function PrRow({ pr, isOwned }: { pr: DashboardPrItem; isOwned: boolean }) {
	return (
		<Link
			href={`/${pr.ownerLogin}/${pr.repoName}/pull/${pr.number}`}
			prefetchKey="repo.pull"
			prefetchParams={{
				owner: pr.ownerLogin,
				name: pr.repoName,
				number: pr.number,
			}}
			className="flex items-center gap-2.5 border-b border-border/30 px-3 py-2 no-underline transition-colors hover:bg-accent/50 last:border-b-0"
		>
			<PrStateIcon state={pr.state} draft={pr.draft} />
			<div className="min-w-0 flex-1">
				<p className="truncate text-[13px] font-medium text-foreground leading-tight">
					{pr.title}
				</p>
				<div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground/60">
					<span className="truncate">
						{pr.ownerLogin}/{pr.repoName}
					</span>
					<span className="text-border">|</span>
					<span>#{pr.number}</span>
					<span className="text-border">|</span>
					<span>{formatRelative(pr.githubUpdatedAt)}</span>
					{pr.commentCount > 0 && (
						<>
							<span className="text-border">|</span>
							<span className="flex items-center gap-0.5">
								<MessageCircle className="size-2.5" />
								{pr.commentCount}
							</span>
						</>
					)}
				</div>
			</div>
			{isOwned && pr.lastCheckConclusion === "failure" && (
				<Badge variant="destructive" className="shrink-0 text-[10px]">
					CI
				</Badge>
			)}
			{pr.lastCheckConclusion === "success" && <CheckIcon />}
		</Link>
	);
}

function PrStateIcon({
	state,
	draft,
}: {
	state: "open" | "closed";
	draft: boolean;
}) {
	if (draft) {
		return (
			<div className="mt-0.5 size-3.5 shrink-0 rounded-full border-2 border-muted-foreground/50" />
		);
	}
	if (state === "open") {
		return (
			<GitPullRequest className="mt-0.5 size-3.5 shrink-0 text-status-open" />
		);
	}
	return (
		<GitPullRequest className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
	);
}

function CheckIcon() {
	return (
		<svg
			className="size-3 shrink-0 text-status-open"
			viewBox="0 0 16 16"
			fill="currentColor"
		>
			<path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
		</svg>
	);
}

// ---------------------------------------------------------------------------
// Issue Row
// ---------------------------------------------------------------------------

function IssueRow({ issue }: { issue: DashboardIssueItem }) {
	return (
		<Link
			href={`/${issue.ownerLogin}/${issue.repoName}/issues/${issue.number}`}
			prefetchKey="repo.issue"
			prefetchParams={{
				owner: issue.ownerLogin,
				name: issue.repoName,
				number: issue.number,
			}}
			className="flex items-center gap-2.5 border-b border-border/30 px-3 py-2 no-underline transition-colors hover:bg-accent/50 last:border-b-0"
		>
			<CircleDot
				className={cn(
					"mt-0.5 size-3.5 shrink-0",
					issue.state === "open" ? "text-status-open" : "text-muted-foreground",
				)}
			/>
			<div className="min-w-0 flex-1">
				<p className="truncate text-[13px] font-medium text-foreground leading-tight">
					{issue.title}
				</p>
				<div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground/60">
					<span className="truncate">
						{issue.ownerLogin}/{issue.repoName}
					</span>
					<span className="text-border">|</span>
					<span>#{issue.number}</span>
					<span className="text-border">|</span>
					<span>{formatRelative(issue.githubUpdatedAt)}</span>
					{issue.commentCount > 0 && (
						<>
							<span className="text-border">|</span>
							<span className="flex items-center gap-0.5">
								<MessageCircle className="size-2.5" />
								{issue.commentCount}
							</span>
						</>
					)}
				</div>
			</div>
			{issue.labelNames.length > 0 && (
				<div className="flex shrink-0 gap-1">
					{issue.labelNames.slice(0, 2).map((label) => (
						<Badge key={label} variant="outline" className="text-[10px]">
							{label}
						</Badge>
					))}
					{issue.labelNames.length > 2 && (
						<span className="font-mono text-[10px] text-muted-foreground/40">
							+{issue.labelNames.length - 2}
						</span>
					)}
				</div>
			)}
		</Link>
	);
}

// ---------------------------------------------------------------------------
// Repository Row
// ---------------------------------------------------------------------------

function RepoRow({ repo }: { repo: RepoSummary }) {
	return (
		<Link
			href={`/${repo.ownerLogin}/${repo.name}`}
			prefetchKey="repo.overview"
			prefetchParams={{ owner: repo.ownerLogin, name: repo.name }}
			className="flex items-center justify-between gap-2 border-b border-border/30 px-3 py-2 no-underline transition-colors hover:bg-accent/50 last:border-b-0"
		>
			<div className="min-w-0 flex-1">
				<p className="truncate text-[13px] font-medium text-foreground leading-tight">
					{repo.fullName}
				</p>
				<div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground/60">
					<span>{repo.openPrCount} PRs</span>
					<span className="text-border">|</span>
					<span>{repo.openIssueCount} issues</span>
					{repo.lastPushAt !== null && (
						<>
							<span className="text-border">|</span>
							<span>{formatRelative(repo.lastPushAt)}</span>
						</>
					)}
				</div>
			</div>
			{repo.failingCheckCount > 0 && (
				<Badge variant="destructive" className="shrink-0 text-[10px]">
					{repo.failingCheckCount} CI
				</Badge>
			)}
		</Link>
	);
}

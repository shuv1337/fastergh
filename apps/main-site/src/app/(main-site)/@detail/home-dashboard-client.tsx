"use client";

import { Result, useAtomValue } from "@effect-atom/atom-react";
import { useSubscriptionWithInitial } from "@packages/confect/rpc";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@packages/ui/components/avatar";
import { Badge } from "@packages/ui/components/badge";
import { Button } from "@packages/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@packages/ui/components/card";
import { Link } from "@packages/ui/components/link";
import { Skeleton } from "@packages/ui/components/skeleton";
import { GitHubIcon } from "@packages/ui/icons/index";
import { authClient } from "@packages/ui/lib/auth-client";
import { cn } from "@packages/ui/lib/utils";
import { useProjectionQueries } from "@packages/ui/rpc/projection-queries";
import {
	Activity,
	AlertTriangle,
	ArrowRight,
	CheckCircle2,
	CircleDot,
	Eye,
	GitBranch,
	GitPullRequest,
	MessageCircle,
	Rocket,
	User,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

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

const EmptyPayload: Record<string, never> = {};

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
	githubUpdatedAt: number;
};

type ActivityItem = {
	ownerLogin: string;
	repoName: string;
	activityType: string;
	title: string;
	description: string | null;
	actorLogin: string | null;
	actorAvatarUrl: string | null;
	entityNumber: number | null;
	createdAt: number;
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
	githubLogin: string | null;
	yourPrs: ReadonlyArray<DashboardPrItem>;
	needsAttentionPrs: ReadonlyArray<DashboardPrItem>;
	recentPrs: ReadonlyArray<DashboardPrItem>;
	recentActivity: ReadonlyArray<ActivityItem>;
	repos: ReadonlyArray<RepoSummary>;
};

type AttentionItem = {
	id: string;
	path: string;
	repoLabel: string;
	title: string;
	number: number;
	reason: string;
	source: "review" | "owned" | "failing";
	priority: number;
	githubUpdatedAt: number;
	lastCheckConclusion: string | null;
};

type AttentionScope = "all" | "my" | "failing";

function buildAttentionQueue(data: DashboardData): Array<AttentionItem> {
	const next = new Map<string, AttentionItem>();

	const upsert = (item: AttentionItem) => {
		const existing = next.get(item.id);
		if (existing === undefined) {
			next.set(item.id, item);
			return;
		}
		if (item.priority > existing.priority) {
			next.set(item.id, item);
			return;
		}
		if (
			item.priority === existing.priority &&
			item.githubUpdatedAt > existing.githubUpdatedAt
		) {
			next.set(item.id, item);
		}
	};

	for (const pr of data.needsAttentionPrs) {
		const id = `${pr.ownerLogin}/${pr.repoName}#${pr.number}`;
		upsert({
			id,
			path: `/${pr.ownerLogin}/${pr.repoName}/pulls/${pr.number}`,
			repoLabel: `${pr.ownerLogin}/${pr.repoName}`,
			title: pr.title,
			number: pr.number,
			reason: "Needs your review",
			source: "review",
			priority: 100,
			githubUpdatedAt: pr.githubUpdatedAt,
			lastCheckConclusion: pr.lastCheckConclusion,
		});
	}

	for (const pr of data.yourPrs) {
		const id = `${pr.ownerLogin}/${pr.repoName}#${pr.number}`;
		const hasFailingChecks = pr.lastCheckConclusion === "failure";
		upsert({
			id,
			path: `/${pr.ownerLogin}/${pr.repoName}/pulls/${pr.number}`,
			repoLabel: `${pr.ownerLogin}/${pr.repoName}`,
			title: pr.title,
			number: pr.number,
			reason: hasFailingChecks
				? "Your PR has failing checks"
				: "Your PR needs progress",
			source: "owned",
			priority: hasFailingChecks ? 95 : 76,
			githubUpdatedAt: pr.githubUpdatedAt,
			lastCheckConclusion: pr.lastCheckConclusion,
		});
	}

	for (const pr of data.recentPrs) {
		if (pr.lastCheckConclusion !== "failure") continue;
		const id = `${pr.ownerLogin}/${pr.repoName}#${pr.number}`;
		upsert({
			id,
			path: `/${pr.ownerLogin}/${pr.repoName}/pulls/${pr.number}`,
			repoLabel: `${pr.ownerLogin}/${pr.repoName}`,
			title: pr.title,
			number: pr.number,
			reason: "Failing CI checks",
			source: "failing",
			priority: 88,
			githubUpdatedAt: pr.githubUpdatedAt,
			lastCheckConclusion: pr.lastCheckConclusion,
		});
	}

	return [...next.values()].sort((a, b) => {
		if (b.priority !== a.priority) return b.priority - a.priority;
		return b.githubUpdatedAt - a.githubUpdatedAt;
	});
}

export function HomeDashboard({
	initialDashboard,
}: {
	initialDashboard: DashboardData;
}) {
	const session = authClient.useSession();
	const client = useProjectionQueries();
	const dashboardAtom = useMemo(
		() => client.getHomeDashboard.subscription(EmptyPayload),
		[client],
	);
	const dashboardResult = useAtomValue(dashboardAtom);
	const data = useSubscriptionWithInitial(dashboardAtom, initialDashboard);
	const [attentionScope, setAttentionScope] = useState<AttentionScope>("all");

	if (session.isPending || Result.isInitial(dashboardResult)) {
		return <DashboardSkeleton />;
	}

	const isSignedIn = session.data !== null;
	const attentionQueue = buildAttentionQueue(data);
	const visibleAttentionQueue = attentionQueue.filter((item) => {
		if (attentionScope === "all") return true;
		if (attentionScope === "my") {
			return item.source === "review" || item.source === "owned";
		}
		return item.lastCheckConclusion === "failure";
	});

	const totalOpenPrs = data.repos.reduce(
		(sum, repo) => sum + repo.openPrCount,
		0,
	);
	const totalOpenIssues = data.repos.reduce(
		(sum, repo) => sum + repo.openIssueCount,
		0,
	);
	const totalFailing = data.repos.reduce(
		(sum, repo) => sum + repo.failingCheckCount,
		0,
	);
	const failingPrs = [
		...data.yourPrs,
		...data.needsAttentionPrs,
		...data.recentPrs,
	]
		.filter((pr) => pr.lastCheckConclusion === "failure")
		.slice(0, 12);

	return (
		<div className="h-full overflow-y-auto">
			<div className="px-4 py-4 md:px-6 md:py-5">
				<div className="mb-4 flex flex-wrap items-end justify-between gap-2">
					<div>
						<div className="mb-1 flex items-center gap-2">
							<Rocket className="size-4 text-muted-foreground" />
							<h1 className="text-lg font-semibold tracking-tight text-foreground">
								{data.githubLogin !== null
									? `${data.githubLogin}'s Workbench`
									: isSignedIn
										? "Team Workbench"
										: "QuickHub Workbench"}
							</h1>
						</div>
						<p className="text-xs text-muted-foreground">
							Cross-repo triage for what needs attention now.
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Button asChild size="sm" variant="outline" className="h-7 text-xs">
							<Link href="/inbox">Inbox</Link>
						</Button>
					</div>
				</div>

				{!isSignedIn && (
					<Card className="mb-4 border-border/60 bg-muted/20">
						<CardContent className="pt-4">
							<div className="flex items-start gap-3">
								<div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground/5">
									<GitHubIcon className="size-4 text-foreground/70" />
								</div>
								<div className="min-w-0 flex-1">
									<p className="text-xs font-semibold text-foreground">
										Sign in to unlock personal attention queues
									</p>
									<p className="mt-1 text-[11px] text-muted-foreground">
										Get your PR workload, review queue, and CI blockers in one
										place.
									</p>
									<Button
										size="sm"
										className="mt-3 h-7 text-xs"
										onClick={() => {
											authClient.signIn.social({ provider: "github" });
										}}
									>
										<GitHubIcon className="size-3.5" />
										Sign in with GitHub
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>
				)}

				<div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
					<KpiCard
						label="Attention"
						value={visibleAttentionQueue.length}
						icon={<Eye className="size-3 text-yellow-500" />}
					/>
					<KpiCard
						label="Open PRs"
						value={totalOpenPrs}
						icon={<GitPullRequest className="size-3 text-green-500" />}
					/>
					<KpiCard
						label="Open Issues"
						value={totalOpenIssues}
						icon={<CircleDot className="size-3 text-blue-500" />}
					/>
					<KpiCard
						label="Failing Checks"
						value={totalFailing}
						icon={<AlertTriangle className="size-3 text-red-500" />}
						alert={totalFailing > 0}
					/>
				</div>

				<div className="grid gap-4 xl:grid-cols-12">
					<div className="space-y-4 xl:col-span-8">
						<AttentionQueueCard
							items={visibleAttentionQueue}
							scope={attentionScope}
							onScopeChange={setAttentionScope}
						/>

						<div className="grid gap-4 lg:grid-cols-2">
							<PrListCard
								title="Your Pull Requests"
								emptyLabel="No personal PRs in view"
								icon={<User className="size-3.5 text-green-500" />}
								prs={data.yourPrs}
							/>
							<PrListCard
								title="Needs Your Attention"
								emptyLabel="No review requests right now"
								icon={<Eye className="size-3.5 text-yellow-500" />}
								prs={data.needsAttentionPrs}
							/>
						</div>

						<ActivityCard items={data.recentActivity} />
					</div>

					<div className="space-y-4 xl:col-span-4">
						<RepoHealthCard repos={data.repos} />
						<PrListCard
							title="Failing PR Checks"
							emptyLabel="No failing checks in sampled PRs"
							icon={<AlertTriangle className="size-3.5 text-red-500" />}
							prs={failingPrs}
						/>
						<PrListCard
							title="Recently Active PRs"
							emptyLabel="No recent pull requests"
							icon={<GitBranch className="size-3.5 text-muted-foreground" />}
							prs={data.recentPrs}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

function KpiCard({
	label,
	value,
	icon,
	alert = false,
}: {
	label: string;
	value: number;
	icon: ReactNode;
	alert?: boolean;
}) {
	return (
		<Card
			className={cn("border", alert && "border-red-500/30 bg-red-500/[0.03]")}
		>
			<CardContent className="pt-3">
				<div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
					{icon}
					{label}
				</div>
				<p
					className={cn(
						"text-xl font-semibold tabular-nums",
						alert ? "text-red-500" : "text-foreground",
					)}
				>
					{value}
				</p>
			</CardContent>
		</Card>
	);
}

function AttentionQueueCard({
	items,
	scope,
	onScopeChange,
}: {
	items: ReadonlyArray<AttentionItem>;
	scope: AttentionScope;
	onScopeChange: (scope: AttentionScope) => void;
}) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<div className="mb-2 flex items-center justify-between gap-2">
					<CardTitle className="flex items-center gap-1.5 text-sm">
						<Eye className="size-4 text-yellow-500" />
						Attention Queue
					</CardTitle>
					<Badge variant="outline" className="text-[10px]">
						{items.length}
					</Badge>
				</div>
				<div className="flex flex-wrap gap-1.5">
					<Button
						size="sm"
						variant={scope === "all" ? "default" : "outline"}
						className="h-6 px-2 text-[10px]"
						onClick={() => onScopeChange("all")}
					>
						All
					</Button>
					<Button
						size="sm"
						variant={scope === "my" ? "default" : "outline"}
						className="h-6 px-2 text-[10px]"
						onClick={() => onScopeChange("my")}
					>
						My work
					</Button>
					<Button
						size="sm"
						variant={scope === "failing" ? "default" : "outline"}
						className="h-6 px-2 text-[10px]"
						onClick={() => onScopeChange("failing")}
					>
						Failing checks
					</Button>
				</div>
			</CardHeader>
			<CardContent>
				{items.length === 0 && (
					<p className="text-xs text-muted-foreground">
						No urgent items right now. Nice.
					</p>
				)}

				{items.length > 0 && (
					<div className="divide-y rounded-md border">
						{items.slice(0, 14).map((item) => (
							<Link
								key={item.id}
								href={item.path}
								className="flex items-start gap-2 px-3 py-2 no-underline transition-colors hover:bg-muted"
							>
								<div
									className={cn(
										"mt-1 size-2.5 rounded-full shrink-0",
										item.lastCheckConclusion === "failure"
											? "bg-red-500"
											: "bg-yellow-500",
									)}
								/>
								<div className="min-w-0 flex-1">
									<p className="truncate text-xs font-medium text-foreground">
										{item.title}
									</p>
									<div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
										<span>{item.repoLabel}</span>
										<span>#{item.number}</span>
										<span>{formatRelative(item.githubUpdatedAt)}</span>
									</div>
								</div>
								<Badge
									variant="outline"
									className="text-[9px] text-muted-foreground"
								>
									{item.reason}
								</Badge>
							</Link>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function PrListCard({
	title,
	icon,
	prs,
	emptyLabel,
}: {
	title: string;
	icon: ReactNode;
	prs: ReadonlyArray<DashboardPrItem>;
	emptyLabel: string;
}) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between gap-2">
					<CardTitle className="flex items-center gap-1.5 text-sm">
						{icon}
						{title}
					</CardTitle>
					{prs.length > 0 && (
						<Badge variant="outline" className="text-[10px]">
							{prs.length}
						</Badge>
					)}
				</div>
			</CardHeader>
			<CardContent>
				{prs.length === 0 && (
					<p className="text-xs text-muted-foreground">{emptyLabel}</p>
				)}

				{prs.length > 0 && (
					<div className="divide-y rounded-md border">
						{prs.slice(0, 8).map((pr) => (
							<Link
								key={`${pr.ownerLogin}/${pr.repoName}#${pr.number}`}
								href={`/${pr.ownerLogin}/${pr.repoName}/pulls/${pr.number}`}
								className="flex items-start gap-2 px-3 py-2 no-underline transition-colors hover:bg-muted"
							>
								<PrStateIcon state={pr.state} draft={pr.draft} />
								<div className="min-w-0 flex-1">
									<p className="truncate text-xs font-medium text-foreground">
										{pr.title}
									</p>
									<div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
										<span className="truncate">
											{pr.ownerLogin}/{pr.repoName}
										</span>
										<span>#{pr.number}</span>
										<span>{formatRelative(pr.githubUpdatedAt)}</span>
										{pr.commentCount > 0 && (
											<span className="flex items-center gap-0.5">
												<MessageCircle className="size-2.5" />
												{pr.commentCount}
											</span>
										)}
									</div>
								</div>
								{pr.lastCheckConclusion === "failure" && (
									<AlertTriangle className="mt-0.5 size-3 text-red-500" />
								)}
							</Link>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function ActivityCard({ items }: { items: ReadonlyArray<ActivityItem> }) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="flex items-center gap-1.5 text-sm">
					<Activity className="size-4 text-blue-500" />
					Recent Activity
				</CardTitle>
			</CardHeader>
			<CardContent>
				{items.length === 0 && (
					<p className="text-xs text-muted-foreground">
						No recent activity yet.
					</p>
				)}
				{items.length > 0 && (
					<div className="divide-y rounded-md border">
						{items.slice(0, 14).map((activity, index) => (
							<ActivityRow
								key={`${activity.ownerLogin}/${activity.repoName}-${activity.createdAt}-${index}`}
								activity={activity}
							/>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function RepoHealthCard({ repos }: { repos: ReadonlyArray<RepoSummary> }) {
	const rankedRepos = [...repos].sort((a, b) => {
		const scoreA =
			a.failingCheckCount * 20 + a.openPrCount * 4 + a.openIssueCount;
		const scoreB =
			b.failingCheckCount * 20 + b.openPrCount * 4 + b.openIssueCount;
		return scoreB - scoreA;
	});

	return (
		<Card>
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between gap-2">
					<CardTitle className="flex items-center gap-1.5 text-sm">
						<GitBranch className="size-4 text-muted-foreground" />
						Repo Health
					</CardTitle>
					<Badge variant="outline" className="text-[10px]">
						{repos.length}
					</Badge>
				</div>
			</CardHeader>
			<CardContent>
				{repos.length === 0 && (
					<p className="text-xs text-muted-foreground">
						No repositories connected yet.
					</p>
				)}
				{repos.length > 0 && (
					<div className="divide-y rounded-md border">
						{rankedRepos.slice(0, 12).map((repo) => (
							<Link
								key={repo.fullName}
								href={`/${repo.ownerLogin}/${repo.name}/pulls`}
								className="block px-3 py-2 no-underline transition-colors hover:bg-muted"
							>
								<div className="flex items-start justify-between gap-2">
									<div className="min-w-0">
										<p className="truncate text-xs font-semibold text-foreground">
											{repo.fullName}
										</p>
										<div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
											<span>{repo.openPrCount} PRs</span>
											<span>{repo.openIssueCount} issues</span>
											{repo.lastPushAt !== null && (
												<span>{formatRelative(repo.lastPushAt)}</span>
											)}
										</div>
									</div>
									<div className="flex items-center gap-1">
										{repo.failingCheckCount > 0 ? (
											<Badge variant="destructive" className="text-[9px]">
												{repo.failingCheckCount} failing
											</Badge>
										) : (
											<Badge
												variant="outline"
												className="text-[9px] text-green-600"
											>
												<CheckCircle2 className="size-2.5" />
												healthy
											</Badge>
										)}
										<ArrowRight className="size-3 text-muted-foreground" />
									</div>
								</div>
							</Link>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function ActivityRow({ activity }: { activity: ActivityItem }) {
	const href = (() => {
		const base = `/${activity.ownerLogin}/${activity.repoName}`;
		if (activity.entityNumber === null) return base;
		if (
			activity.activityType === "pr_opened" ||
			activity.activityType === "pr_closed" ||
			activity.activityType === "pr_merged" ||
			activity.activityType === "pr_review"
		) {
			return `${base}/pulls/${activity.entityNumber}`;
		}
		if (
			activity.activityType === "issue_opened" ||
			activity.activityType === "issue_closed"
		) {
			return `${base}/issues/${activity.entityNumber}`;
		}
		return base;
	})();

	return (
		<Link
			href={href}
			className="flex items-center gap-2.5 px-3 py-2 no-underline transition-colors hover:bg-muted"
		>
			{activity.actorAvatarUrl !== null ? (
				<Avatar className="size-5">
					<AvatarImage
						src={activity.actorAvatarUrl}
						alt={activity.actorLogin ?? ""}
					/>
					<AvatarFallback className="text-[8px]">
						{activity.actorLogin?.[0]?.toUpperCase() ?? "?"}
					</AvatarFallback>
				</Avatar>
			) : (
				<div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted">
					<Activity className="size-3 text-muted-foreground" />
				</div>
			)}
			<div className="min-w-0 flex-1">
				<p className="truncate text-xs text-foreground">
					<span className="font-medium">
						{activity.actorLogin ?? "Someone"}
					</span>{" "}
					{activityVerb(activity.activityType)} {activity.title}
				</p>
				<div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
					<span>
						{activity.ownerLogin}/{activity.repoName}
					</span>
					<span>{formatRelative(activity.createdAt)}</span>
				</div>
			</div>
		</Link>
	);
}

function activityVerb(type: string): string {
	switch (type) {
		case "pr_opened":
			return "opened PR";
		case "pr_closed":
			return "closed PR";
		case "pr_merged":
			return "merged PR";
		case "pr_review":
			return "reviewed PR";
		case "issue_opened":
			return "opened issue";
		case "issue_closed":
			return "closed issue";
		case "push":
			return "pushed to";
		default:
			return type.replace(/_/g, " ");
	}
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
			<div className="mt-0.5 size-3.5 shrink-0 rounded-full border-2 border-muted-foreground" />
		);
	}
	if (state === "open") {
		return (
			<GitPullRequest className="mt-0.5 size-3.5 shrink-0 text-green-600" />
		);
	}
	return (
		<GitPullRequest className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
	);
}

export function DashboardSkeleton() {
	return (
		<div className="h-full overflow-y-auto px-4 py-4 md:px-6 md:py-5">
			<Skeleton className="mb-4 h-6 w-48" />
			<div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
				<Skeleton className="h-20" />
				<Skeleton className="h-20" />
				<Skeleton className="h-20" />
				<Skeleton className="h-20" />
			</div>
			<div className="grid gap-4 xl:grid-cols-12">
				<div className="space-y-4 xl:col-span-8">
					<Skeleton className="h-60" />
					<div className="grid gap-4 lg:grid-cols-2">
						<Skeleton className="h-72" />
						<Skeleton className="h-72" />
					</div>
					<Skeleton className="h-72" />
				</div>
				<div className="space-y-4 xl:col-span-4">
					<Skeleton className="h-72" />
					<Skeleton className="h-72" />
					<Skeleton className="h-72" />
				</div>
			</div>
		</div>
	);
}

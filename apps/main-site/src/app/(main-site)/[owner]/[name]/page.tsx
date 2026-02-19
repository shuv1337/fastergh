"use client";

import { Result, useAtomValue } from "@effect-atom/atom-react";
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
	CardDescription,
	CardHeader,
	CardTitle,
} from "@packages/ui/components/card";
import { Link } from "@packages/ui/components/link";
import { Skeleton } from "@packages/ui/components/skeleton";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@packages/ui/components/tabs";
import { useProjectionQueries } from "@packages/ui/rpc/projection-queries";
import { Option } from "effect";
import { useQueryStates } from "nuqs";
import { use, useMemo } from "react";
import {
	type RepoTab,
	repoDetailParsers,
	type StateFilter,
} from "./search-params";

const PAGE_SIZE = 50;

export default function RepoDetailPage(props: {
	params: Promise<{ owner: string; name: string }>;
}) {
	const params = use(props.params);
	const { owner, name } = params;
	const [{ tab, state: stateFilter }, setParams] =
		useQueryStates(repoDetailParsers);

	return (
		<main className="mx-auto max-w-5xl px-4 py-8">
			<div className="mb-6">
				<Link
					href="/"
					className="text-sm text-muted-foreground hover:text-foreground"
				>
					&larr; All repositories
				</Link>
			</div>
			<RepoHeader owner={owner} name={name} />
			<Tabs
				value={tab}
				onValueChange={(value) => {
					setParams({
						tab: value as RepoTab,
						// Reset state filter when switching tabs
						state: "open",
					});
				}}
				className="mt-6"
			>
				<TabsList>
					<TabsTrigger value="pulls">Pull Requests</TabsTrigger>
					<TabsTrigger value="issues">Issues</TabsTrigger>
					<TabsTrigger value="activity">Activity</TabsTrigger>
				</TabsList>
				<TabsContent value="pulls">
					<StateFilterBar
						value={stateFilter}
						onChange={(s) => setParams({ state: s })}
					/>
					<PullRequestList
						owner={owner}
						name={name}
						stateFilter={stateFilter}
					/>
				</TabsContent>
				<TabsContent value="issues">
					<StateFilterBar
						value={stateFilter}
						onChange={(s) => setParams({ state: s })}
					/>
					<IssueList owner={owner} name={name} stateFilter={stateFilter} />
				</TabsContent>
				<TabsContent value="activity">
					<ActivityFeed owner={owner} name={name} />
				</TabsContent>
			</Tabs>
		</main>
	);
}

// --- State filter bar ---

function StateFilterBar({
	value,
	onChange,
}: {
	value: StateFilter;
	onChange: (value: StateFilter) => void;
}) {
	return (
		<div className="mt-4 flex gap-2">
			<Button
				variant={value === "open" ? "default" : "outline"}
				size="sm"
				onClick={() => onChange("open")}
			>
				Open
			</Button>
			<Button
				variant={value === "closed" ? "default" : "outline"}
				size="sm"
				onClick={() => onChange("closed")}
			>
				Closed
			</Button>
			<Button
				variant={value === "all" ? "default" : "outline"}
				size="sm"
				onClick={() => onChange("all")}
			>
				All
			</Button>
		</div>
	);
}

// --- Repo header ---

function RepoHeader({ owner, name }: { owner: string; name: string }) {
	const client = useProjectionQueries();
	const overviewAtom = useMemo(
		() => client.getRepoOverview.subscription({ ownerLogin: owner, name }),
		[client, owner, name],
	);
	const overviewResult = useAtomValue(overviewAtom);

	if (Result.isInitial(overviewResult)) {
		return (
			<div>
				<Skeleton className="h-8 w-64" />
				<div className="mt-3 flex gap-3">
					<Skeleton className="h-6 w-24" />
					<Skeleton className="h-6 w-28" />
				</div>
			</div>
		);
	}

	const valueOption = Result.value(overviewResult);
	if (Option.isNone(valueOption) || valueOption.value === null) {
		return (
			<div>
				<h1 className="text-2xl font-bold">
					{owner}/{name}
				</h1>
				<p className="mt-2 text-muted-foreground">Repository not found</p>
			</div>
		);
	}

	const overview = valueOption.value;
	return (
		<div>
			<h1 className="text-2xl font-bold">
				<span className="text-muted-foreground">{owner}/</span>
				{name}
			</h1>
			<div className="mt-3 flex gap-3">
				<Badge variant="secondary">
					{overview.openPrCount} open PR{overview.openPrCount !== 1 ? "s" : ""}
				</Badge>
				<Badge variant="secondary">
					{overview.openIssueCount} open issue
					{overview.openIssueCount !== 1 ? "s" : ""}
				</Badge>
				{overview.failingCheckCount > 0 && (
					<Badge variant="destructive">
						{overview.failingCheckCount} failing
					</Badge>
				)}
				{overview.lastPushAt && (
					<span className="text-sm text-muted-foreground">
						Last push {formatRelative(overview.lastPushAt)}
					</span>
				)}
			</div>
		</div>
	);
}

// --- Pull request list with state filter ---

function PullRequestList({
	owner,
	name,
	stateFilter,
}: {
	owner: string;
	name: string;
	stateFilter: StateFilter;
}) {
	const client = useProjectionQueries();
	const prsAtom = useMemo(
		() =>
			client.listPullRequests.subscription({
				ownerLogin: owner,
				name,
				state:
					stateFilter === "all"
						? undefined
						: (stateFilter as "open" | "closed"),
			}),
		[client, owner, name, stateFilter],
	);
	const prsResult = useAtomValue(prsAtom);

	if (Result.isInitial(prsResult)) {
		return <ListSkeleton />;
	}

	const valueOption = Result.value(prsResult);
	if (Option.isNone(valueOption)) return null;
	const prs = valueOption.value;

	if (prs.length === 0) {
		return (
			<Card className="mt-4">
				<CardHeader>
					<CardDescription>
						No {stateFilter !== "all" ? stateFilter : ""} pull requests found.
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<>
			<div className="mt-4 divide-y rounded-lg border">
				{prs.map((pr) => (
					<Link
						key={pr.number}
						href={`/${owner}/${name}/pulls/${pr.number}`}
						className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
					>
						<div className="mt-0.5">
							<PrStateIcon state={pr.state} draft={pr.draft} />
						</div>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<span className="font-medium">{pr.title}</span>
								{pr.draft && (
									<Badge variant="outline" className="text-xs">
										Draft
									</Badge>
								)}
								{pr.lastCheckConclusion && (
									<CheckBadge conclusion={pr.lastCheckConclusion} />
								)}
							</div>
							<div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
								<span>#{pr.number}</span>
								{pr.authorLogin && (
									<span className="flex items-center gap-1">
										<Avatar className="size-4">
											<AvatarImage src={pr.authorAvatarUrl ?? undefined} />
											<AvatarFallback className="text-[8px]">
												{pr.authorLogin[0]?.toUpperCase()}
											</AvatarFallback>
										</Avatar>
										{pr.authorLogin}
									</span>
								)}
								<span>
									{pr.headRefName} &rarr; {pr.baseRefName}
								</span>
								<span>{formatRelative(pr.githubUpdatedAt)}</span>
								{pr.commentCount > 0 && (
									<span>
										{pr.commentCount} comment{pr.commentCount !== 1 ? "s" : ""}
									</span>
								)}
								{pr.reviewCount > 0 && (
									<span>
										{pr.reviewCount} review{pr.reviewCount !== 1 ? "s" : ""}
									</span>
								)}
							</div>
						</div>
					</Link>
				))}
			</div>
			{prs.length >= 200 && (
				<p className="mt-2 text-center text-sm text-muted-foreground">
					Showing first 200 results
				</p>
			)}
		</>
	);
}

// --- Issue list with state filter ---

function IssueList({
	owner,
	name,
	stateFilter,
}: {
	owner: string;
	name: string;
	stateFilter: StateFilter;
}) {
	const client = useProjectionQueries();
	const issuesAtom = useMemo(
		() =>
			client.listIssues.subscription({
				ownerLogin: owner,
				name,
				state:
					stateFilter === "all"
						? undefined
						: (stateFilter as "open" | "closed"),
			}),
		[client, owner, name, stateFilter],
	);
	const issuesResult = useAtomValue(issuesAtom);

	if (Result.isInitial(issuesResult)) {
		return <ListSkeleton />;
	}

	const valueOption = Result.value(issuesResult);
	if (Option.isNone(valueOption)) return null;
	const issues = valueOption.value;

	if (issues.length === 0) {
		return (
			<Card className="mt-4">
				<CardHeader>
					<CardDescription>
						No {stateFilter !== "all" ? stateFilter : ""} issues found.
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<>
			<div className="mt-4 divide-y rounded-lg border">
				{issues.map((issue) => (
					<Link
						key={issue.number}
						href={`/${owner}/${name}/issues/${issue.number}`}
						className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
					>
						<div className="mt-0.5">
							<IssueStateIcon state={issue.state} />
						</div>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<span className="font-medium">{issue.title}</span>
								{issue.labelNames.map((label) => (
									<Badge key={label} variant="outline" className="text-xs">
										{label}
									</Badge>
								))}
							</div>
							<div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
								<span>#{issue.number}</span>
								{issue.authorLogin && (
									<span className="flex items-center gap-1">
										<Avatar className="size-4">
											<AvatarImage src={issue.authorAvatarUrl ?? undefined} />
											<AvatarFallback className="text-[8px]">
												{issue.authorLogin[0]?.toUpperCase()}
											</AvatarFallback>
										</Avatar>
										{issue.authorLogin}
									</span>
								)}
								<span>{formatRelative(issue.githubUpdatedAt)}</span>
								{issue.commentCount > 0 && (
									<span>
										{issue.commentCount} comment
										{issue.commentCount !== 1 ? "s" : ""}
									</span>
								)}
							</div>
						</div>
					</Link>
				))}
			</div>
			{issues.length >= 200 && (
				<p className="mt-2 text-center text-sm text-muted-foreground">
					Showing first 200 results
				</p>
			)}
		</>
	);
}

// --- Activity feed with bounded query ---

function ActivityFeed({ owner, name }: { owner: string; name: string }) {
	const client = useProjectionQueries();
	const activityAtom = useMemo(
		() =>
			client.listActivity.subscription({
				ownerLogin: owner,
				name,
				limit: PAGE_SIZE,
			}),
		[client, owner, name],
	);
	const activityResult = useAtomValue(activityAtom);

	if (Result.isInitial(activityResult)) {
		return <ListSkeleton />;
	}

	const valueOption = Result.value(activityResult);
	if (Option.isNone(valueOption)) return null;
	const activities = valueOption.value;

	if (activities.length === 0) {
		return (
			<Card className="mt-4">
				<CardHeader>
					<CardDescription>No activity recorded yet.</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<div className="mt-4 divide-y rounded-lg border">
			{activities.map((activity, i) => {
				const linkHref = getActivityLink(
					owner,
					name,
					activity.activityType,
					activity.entityNumber,
				);
				const content = (
					<>
						{activity.actorLogin && (
							<Avatar className="mt-0.5 size-6">
								<AvatarImage src={activity.actorAvatarUrl ?? undefined} />
								<AvatarFallback className="text-[8px]">
									{activity.actorLogin[0]?.toUpperCase()}
								</AvatarFallback>
							</Avatar>
						)}
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2 text-sm">
								<Badge variant="outline" className="text-xs">
									{activity.activityType}
								</Badge>
								<span className="font-medium">{activity.title}</span>
								{activity.entityNumber && (
									<span className="text-muted-foreground">
										#{activity.entityNumber}
									</span>
								)}
							</div>
							{activity.description && (
								<p className="mt-0.5 text-sm text-muted-foreground truncate">
									{activity.description}
								</p>
							)}
							<span className="text-xs text-muted-foreground">
								{formatRelative(activity.createdAt)}
							</span>
						</div>
					</>
				);

				if (linkHref) {
					return (
						<Link
							key={`${activity.createdAt}-${i}`}
							href={linkHref}
							className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
						>
							{content}
						</Link>
					);
				}

				return (
					<div
						key={`${activity.createdAt}-${i}`}
						className="flex items-start gap-3 px-4 py-3"
					>
						{content}
					</div>
				);
			})}
		</div>
	);
}

// --- Helper functions ---

function getActivityLink(
	owner: string,
	name: string,
	activityType: string,
	entityNumber: number | null,
): string | null {
	if (entityNumber === null) return null;
	if (activityType.startsWith("pr.") || activityType.startsWith("pr_review.")) {
		return `/${owner}/${name}/pulls/${entityNumber}`;
	}
	if (activityType.startsWith("issue.")) {
		return `/${owner}/${name}/issues/${entityNumber}`;
	}
	if (activityType.startsWith("issue_comment.")) {
		return `/${owner}/${name}/issues/${entityNumber}`;
	}
	return null;
}

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

// --- Icon/badge components ---

function PrStateIcon({
	state,
	draft,
}: {
	state: "open" | "closed";
	draft: boolean;
}) {
	if (draft) {
		return (
			<svg
				className="size-4 text-muted-foreground"
				viewBox="0 0 16 16"
				fill="currentColor"
			>
				<path d="M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 14a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5Zm0-3a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM3.25 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
			</svg>
		);
	}
	if (state === "open") {
		return (
			<svg
				className="size-4 text-green-600"
				viewBox="0 0 16 16"
				fill="currentColor"
			>
				<path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
			</svg>
		);
	}
	return (
		<svg
			className="size-4 text-purple-600"
			viewBox="0 0 16 16"
			fill="currentColor"
		>
			<path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8-9a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM4.25 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
		</svg>
	);
}

function IssueStateIcon({ state }: { state: "open" | "closed" }) {
	if (state === "open") {
		return (
			<svg
				className="size-4 text-green-600"
				viewBox="0 0 16 16"
				fill="currentColor"
			>
				<path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
				<path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z" />
			</svg>
		);
	}
	return (
		<svg
			className="size-4 text-purple-600"
			viewBox="0 0 16 16"
			fill="currentColor"
		>
			<path d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z" />
			<path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-1.5 0a6.5 6.5 0 1 0-13 0 6.5 6.5 0 0 0 13 0Z" />
		</svg>
	);
}

function CheckBadge({ conclusion }: { conclusion: string }) {
	if (conclusion === "success") {
		return (
			<Badge variant="secondary" className="text-xs text-green-600">
				Passing
			</Badge>
		);
	}
	if (conclusion === "failure") {
		return (
			<Badge variant="destructive" className="text-xs">
				Failing
			</Badge>
		);
	}
	return (
		<Badge variant="outline" className="text-xs">
			{conclusion}
		</Badge>
	);
}

function ListSkeleton() {
	return (
		<div className="mt-4 divide-y rounded-lg border">
			{[1, 2, 3, 4, 5].map((i) => (
				<div key={i} className="flex items-start gap-3 px-4 py-3">
					<Skeleton className="mt-0.5 size-4 rounded-full" />
					<div className="flex-1">
						<Skeleton className="h-5 w-3/4" />
						<Skeleton className="mt-2 h-4 w-1/2" />
					</div>
				</div>
			))}
		</div>
	);
}

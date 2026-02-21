import { Link } from "@packages/ui/components/link";
import { cn } from "@packages/ui/lib/utils";
import {
	ArrowLeft,
	FileCode2,
	GitPullRequest,
	Play,
	TriangleAlert,
} from "lucide-react";
import { type ReactNode, Suspense } from "react";
import { serverQueries } from "@/lib/server-queries";
import { ListSkeleton } from "./skeletons";

type RepoTab = "pulls" | "issues" | "actions" | "code";

export async function RepoListShell({
	paramsPromise,
	activeTab,
	children,
}: {
	paramsPromise: Promise<{ owner: string; name: string }>;
	activeTab: RepoTab;
	children: ReactNode;
}) {
	const { owner, name } = await paramsPromise;
	const overview = await serverQueries.getRepoOverview.queryPromise({
		ownerLogin: owner,
		name,
	});

	return (
		<div className="flex h-full flex-col bg-sidebar">
			<div className="shrink-0 border-b border-sidebar-border">
				<div className="flex items-center gap-2 px-3 pt-2 pb-0">
					<Link
						href="/"
						className="text-muted-foreground/60 hover:text-foreground transition-colors no-underline"
						aria-label="Back to repositories"
					>
						<ArrowLeft className="size-3.5" />
					</Link>
					<span className="text-xs font-bold text-foreground truncate tracking-tight">
						{owner}
						<span className="text-muted-foreground/40 mx-0.5">/</span>
						{name}
					</span>
				</div>
				<div className="flex px-1 mt-1">
					<Link
						href={`/${owner}/${name}/pulls`}
						className={cn(
							"flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold border-b-2 -mb-px transition-colors no-underline",
							activeTab === "pulls"
								? "border-foreground text-foreground"
								: "border-transparent text-muted-foreground hover:text-foreground",
						)}
					>
						<GitPullRequest className="size-3" />
						PRs
					</Link>
					<Link
						href={`/${owner}/${name}/issues`}
						className={cn(
							"flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold border-b-2 -mb-px transition-colors no-underline",
							activeTab === "issues"
								? "border-foreground text-foreground"
								: "border-transparent text-muted-foreground hover:text-foreground",
						)}
					>
						<TriangleAlert className="size-3" />
						Issues
					</Link>
					<Link
						href={`/${owner}/${name}/actions`}
						className={cn(
							"flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold border-b-2 -mb-px transition-colors no-underline",
							activeTab === "actions"
								? "border-foreground text-foreground"
								: "border-transparent text-muted-foreground hover:text-foreground",
						)}
					>
						<Play className="size-3" />
						Actions
					</Link>
					<Link
						href={`/${owner}/${name}/code`}
						className={cn(
							"flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold border-b-2 -mb-px transition-colors no-underline",
							activeTab === "code"
								? "border-foreground text-foreground"
								: "border-transparent text-muted-foreground hover:text-foreground",
						)}
					>
						<FileCode2 className="size-3" />
						Code
					</Link>
				</div>
				{overview !== null && (
					<div className="flex items-center gap-2 px-3 pb-2 pt-1 text-[10px] text-muted-foreground">
						<span className="tabular-nums">{overview.openPrCount} PRs</span>
						<span className="text-muted-foreground/50">&middot;</span>
						<span className="tabular-nums">
							{overview.openIssueCount} issues
						</span>
						{overview.failingCheckCount > 0 && (
							<>
								<span className="text-muted-foreground/50">&middot;</span>
								<span className="tabular-nums text-destructive font-medium">
									{overview.failingCheckCount} failing
								</span>
							</>
						)}
					</div>
				)}
			</div>
			<div className="flex-1 overflow-y-auto">
				<Suspense fallback={<ListSkeleton />}>{children}</Suspense>
			</div>
		</div>
	);
}

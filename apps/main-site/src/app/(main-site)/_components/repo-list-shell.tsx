import { Link } from "@packages/ui/components/link";
import { cn } from "@packages/ui/lib/utils";
import { ArrowLeft, GitPullRequest, Play, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

type RepoTab = "pulls" | "issues" | "actions";

export function RepoListShell({
	owner,
	name,
	activeTab,
	children,
}: {
	owner: string;
	name: string;
	activeTab: RepoTab;
	children: ReactNode;
}) {
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
				</div>
			</div>
			<div className="flex-1 overflow-y-auto">{children}</div>
		</div>
	);
}

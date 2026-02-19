"use client";

import { useSubscriptionWithInitial } from "@packages/confect/rpc";
import { Badge } from "@packages/ui/components/badge";
import { Link } from "@packages/ui/components/link";
import { cn } from "@packages/ui/lib/utils";
import { useProjectionQueries } from "@packages/ui/rpc/projection-queries";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

type WorkflowRunItem = {
	readonly githubRunId: number;
	readonly workflowName: string | null;
	readonly runNumber: number;
	readonly event: string;
	readonly status: string | null;
	readonly conclusion: string | null;
	readonly headBranch: string | null;
	readonly headSha: string;
	readonly actorLogin: string | null;
	readonly actorAvatarUrl: string | null;
	readonly jobCount: number;
	readonly htmlUrl: string | null;
	readonly createdAt: number;
	readonly updatedAt: number;
};

export function ActionsListClient({
	owner,
	name,
	initialData = [],
}: {
	owner: string;
	name: string;
	initialData?: readonly WorkflowRunItem[];
}) {
	const client = useProjectionQueries();
	const runsAtom = useMemo(
		() =>
			client.listWorkflowRuns.subscription({
				ownerLogin: owner,
				name,
			}),
		[client, owner, name],
	);

	const runs = useSubscriptionWithInitial(runsAtom, initialData);

	const pathname = usePathname();
	const activeRunNumber = (() => {
		const match = /\/actions\/(\d+)/.exec(pathname);
		return match?.[1] ? Number.parseInt(match[1], 10) : null;
	})();

	return (
		<div className="p-1.5">
			{runs.length === 0 && (
				<p className="px-2 py-8 text-xs text-muted-foreground text-center">
					No workflow runs.
				</p>
			)}

			{runs.map((run) => (
				<Link
					key={run.githubRunId}
					href={`/${owner}/${name}/actions/${run.runNumber}`}
					className={cn(
						"flex items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors no-underline",
						activeRunNumber === run.runNumber
							? "bg-accent text-accent-foreground"
							: "hover:bg-accent/50",
					)}
				>
					<RunStatusIcon status={run.status} conclusion={run.conclusion} />
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-1.5">
							<span className="font-medium text-xs truncate leading-tight">
								{run.workflowName ?? `Run #${run.runNumber}`}
							</span>
							{run.conclusion && (
								<ConclusionBadge conclusion={run.conclusion} />
							)}
						</div>
						<div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5 tabular-nums">
							<span>#{run.runNumber}</span>
							{run.headBranch && (
								<code className="rounded-sm bg-muted px-1 py-0.5 text-[9px] font-mono">
									{run.headBranch}
								</code>
							)}
							<span className="text-muted-foreground/40">&middot;</span>
							<span>{run.event}</span>
							{run.actorLogin && (
								<>
									<span className="text-muted-foreground/40">&middot;</span>
									<span>{run.actorLogin}</span>
								</>
							)}
							<span className="text-muted-foreground/40">&middot;</span>
							<span>{formatRelative(run.updatedAt)}</span>
						</div>
					</div>
				</Link>
			))}
		</div>
	);
}

// --- Helpers ---

function RunStatusIcon({
	status,
	conclusion,
}: {
	status: string | null;
	conclusion: string | null;
}) {
	if (conclusion === "success")
		return <CheckCircle2 className="mt-0.5 size-3.5 text-green-600 shrink-0" />;
	if (conclusion === "failure")
		return <XCircle className="mt-0.5 size-3.5 text-red-600 shrink-0" />;
	if (status === "in_progress" || status === "queued")
		return (
			<Loader2 className="mt-0.5 size-3.5 text-yellow-500 shrink-0 animate-spin" />
		);
	return <Circle className="mt-0.5 size-3.5 text-muted-foreground shrink-0" />;
}

function ConclusionBadge({ conclusion }: { conclusion: string }) {
	const variant =
		conclusion === "success"
			? "secondary"
			: conclusion === "failure"
				? "destructive"
				: "outline";
	return (
		<Badge
			variant={variant}
			className={cn(
				"text-[9px] px-1 py-0 shrink-0",
				conclusion === "success" && "text-green-600",
			)}
		>
			{conclusion}
		</Badge>
	);
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

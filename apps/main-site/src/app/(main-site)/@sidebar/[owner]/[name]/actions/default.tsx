import { Suspense } from "react";
import { serverQueries } from "@/lib/server-queries";
import { RepoListShell } from "../../../../_components/repo-list-shell";
import { ListSkeleton } from "../../../../_components/skeletons";
import { WorkflowRunListClient } from "../../../../_components/workflow-run-list-client";

/**
 * Sidebar for the actions/workflow runs list.
 *
 * Synchronous so the outer sidebar Suspense boundary is never triggered.
 * The cached `RepoListShell` renders the tab bar instantly, and all async
 * work happens inside the inner `<Suspense>`.
 */
export default function ActionsListDefault(props: {
	params: Promise<{ owner: string; name: string }>;
	activeRunNumber?: number | null;
}) {
	return (
		<RepoListShell paramsPromise={props.params} activeTab="actions">
			<Suspense fallback={<ListSkeleton />}>
				<WorkflowRunListContent
					paramsPromise={props.params}
					activeRunNumber={props.activeRunNumber ?? null}
				/>
			</Suspense>
		</RepoListShell>
	);
}

async function WorkflowRunListContent({
	paramsPromise,
	activeRunNumber,
}: {
	paramsPromise: Promise<{ owner: string; name: string }>;
	activeRunNumber: number | null;
}) {
	const { owner, name } = await paramsPromise;

	const initialData = await serverQueries.listWorkflowRuns
		.queryPromise({ ownerLogin: owner, name })
		.catch(() => []);

	return (
		<WorkflowRunListClient
			owner={owner}
			name={name}
			initialData={initialData}
			activeRunNumber={activeRunNumber}
		/>
	);
}

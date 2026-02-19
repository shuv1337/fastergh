import { serverQueries } from "@/lib/server-queries";
import { ActionsListClient } from "../../../../_components/actions-list-client";
import { RepoListShell } from "../../../../_components/repo-list-shell";

/**
 * Fallback for the @sidebar slot when navigating directly to /actions/[runNumber].
 */
export default function ActionsListDefault(props: {
	params: Promise<{ owner: string; name: string }>;
}) {
	return (
		<RepoListShell paramsPromise={props.params} activeTab="actions">
			<ActionsListContent paramsPromise={props.params} />
		</RepoListShell>
	);
}

async function ActionsListContent({
	paramsPromise,
}: {
	paramsPromise: Promise<{ owner: string; name: string }>;
}) {
	const { owner, name } = await paramsPromise;

	const initialData = await serverQueries.listWorkflowRuns.queryPromise({
		ownerLogin: owner,
		name,
	});

	return (
		<ActionsListClient owner={owner} name={name} initialData={initialData} />
	);
}

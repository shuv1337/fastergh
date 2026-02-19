import { Suspense } from "react";
import { serverQueries } from "@/lib/server-queries";
import { ActionsListClient } from "../../../../_components/actions-list-client";
import { RepoListShell } from "../../../../_components/repo-list-shell";
import { ListSkeleton } from "../../../../_components/skeletons";

export default async function ActionsListSlot(props: {
	params: Promise<{ owner: string; name: string }>;
}) {
	const { owner, name } = await props.params;

	return (
		<RepoListShell owner={owner} name={name} activeTab="actions">
			<Suspense fallback={<ListSkeleton />}>
				<ActionsListContent owner={owner} name={name} />
			</Suspense>
		</RepoListShell>
	);
}

async function ActionsListContent({
	owner,
	name,
}: {
	owner: string;
	name: string;
}) {
	const initialData = await serverQueries.listWorkflowRuns.queryPromise({
		ownerLogin: owner,
		name,
	});

	return (
		<ActionsListClient owner={owner} name={name} initialData={initialData} />
	);
}

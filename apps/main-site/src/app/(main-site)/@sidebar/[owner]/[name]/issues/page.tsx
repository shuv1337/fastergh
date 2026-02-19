import { Suspense } from "react";
import { serverQueries } from "@/lib/server-queries";
import { IssueListClient } from "../../../../_components/issue-list-client";
import { RepoListShell } from "../../../../_components/repo-list-shell";
import { ListSkeleton } from "../../../../_components/skeletons";

export default async function IssueListSlot(props: {
	params: Promise<{ owner: string; name: string }>;
}) {
	const { owner, name } = await props.params;

	return (
		<RepoListShell owner={owner} name={name} activeTab="issues">
			<Suspense fallback={<ListSkeleton />}>
				<IssueListContent owner={owner} name={name} />
			</Suspense>
		</RepoListShell>
	);
}

async function IssueListContent({
	owner,
	name,
}: {
	owner: string;
	name: string;
}) {
	const initialData = await serverQueries.listIssues.queryPromise({
		ownerLogin: owner,
		name,
		state: "open",
	});

	return (
		<IssueListClient owner={owner} name={name} initialData={initialData} />
	);
}

import { serverQueries } from "@/lib/server-queries";
import { IssueListClient } from "../../../../_components/issue-list-client";
import { RepoListShell } from "../../../../_components/repo-list-shell";

export default function IssueListSlot(props: {
	params: Promise<{ owner: string; name: string }>;
}) {
	return (
		<RepoListShell paramsPromise={props.params} activeTab="issues">
			<IssueListContent paramsPromise={props.params} />
		</RepoListShell>
	);
}

async function IssueListContent({
	paramsPromise,
}: {
	paramsPromise: Promise<{ owner: string; name: string }>;
}) {
	const { owner, name } = await paramsPromise;

	const initialData = await serverQueries.listIssues.queryPromise({
		ownerLogin: owner,
		name,
		state: "open",
	});
	const overview = await serverQueries.getRepoOverview.queryPromise({
		ownerLogin: owner,
		name,
	});

	return (
		<IssueListClient
			owner={owner}
			name={name}
			initialData={initialData}
			repositoryId={overview?.repositoryId ?? null}
		/>
	);
}

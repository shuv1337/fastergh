import { serverQueries } from "@/lib/server-queries";
import { IssueListClient } from "../../../../_components/issue-list-client";
import { RepoListShell } from "../../../../_components/repo-list-shell";

/**
 * Fallback for the @sidebar slot when navigating directly to /issues/[number].
 */
export default function IssueListDefault(props: {
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

	return (
		<IssueListClient owner={owner} name={name} initialData={initialData} />
	);
}

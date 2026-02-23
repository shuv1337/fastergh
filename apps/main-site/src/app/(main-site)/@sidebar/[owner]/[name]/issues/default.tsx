import { Suspense } from "react";
import { serverQueries } from "@/lib/server-queries";
import { IssueListClient } from "../../../../_components/issue-list-client";
import { RepoListShell } from "../../../../_components/repo-list-shell";
import { ListSkeleton } from "../../../../_components/skeletons";

/**
 * Sidebar for the issues list.
 *
 * This component is **synchronous** so it never suspends the outer sidebar
 * boundary. The cached `RepoListShell` renders the tab bar instantly, and
 * all async work (param resolution, data fetching) happens inside the inner
 * `<Suspense>` so only the list content shows a skeleton during navigation.
 */
export default function IssueListDefault(props: {
	params: Promise<{ owner: string; name: string }>;
	activeIssueNumber?: number | null;
}) {
	return (
		<RepoListShell paramsPromise={props.params} activeTab="issues">
			<Suspense fallback={<ListSkeleton />}>
				<IssueListContent
					paramsPromise={props.params}
					activeIssueNumber={props.activeIssueNumber ?? null}
				/>
			</Suspense>
		</RepoListShell>
	);
}

async function IssueListContent({
	paramsPromise,
	activeIssueNumber,
}: {
	paramsPromise: Promise<{ owner: string; name: string }>;
	activeIssueNumber: number | null;
}) {
	const { owner, name } = await paramsPromise;

	const [initialData, overview] = await Promise.all([
		serverQueries.listIssues
			.queryPromise({
				ownerLogin: owner,
				name,
				state: "open",
			})
			.catch(() => []),
		serverQueries.getRepoOverview
			.queryPromise({
				ownerLogin: owner,
				name,
			})
			.catch(() => null),
	]);

	return (
		<IssueListClient
			owner={owner}
			name={name}
			initialData={initialData}
			repositoryId={overview?.repositoryId ?? null}
			activeIssueNumber={activeIssueNumber}
		/>
	);
}

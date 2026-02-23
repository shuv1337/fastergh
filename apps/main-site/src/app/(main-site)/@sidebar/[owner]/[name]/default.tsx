import { Suspense } from "react";
import { serverQueries } from "@/lib/server-queries";
import { PrListClient } from "../../../_components/pr-list-client";
import { RepoListShell } from "../../../_components/repo-list-shell";
import { ListSkeleton } from "../../../_components/skeletons";

/**
 * Default repo sidebar — shows pull requests with the tab bar.
 *
 * Synchronous so the outer sidebar Suspense boundary is never triggered.
 * The cached `RepoListShell` renders the tab bar instantly, and all async
 * work happens inside the inner `<Suspense>`.
 */
export default function SidebarRepoDefault(props: {
	params: Promise<{ owner: string; name: string }>;
	activePullNumber?: number | null;
}) {
	return (
		<RepoListShell paramsPromise={props.params} activeTab="pulls">
			<Suspense fallback={<ListSkeleton />}>
				<PrListContent
					paramsPromise={props.params}
					activePullNumber={props.activePullNumber ?? null}
				/>
			</Suspense>
		</RepoListShell>
	);
}

async function PrListContent({
	paramsPromise,
	activePullNumber,
}: {
	paramsPromise: Promise<{ owner: string; name: string }>;
	activePullNumber: number | null;
}) {
	const { owner, name } = await paramsPromise;

	const initialPrs = await serverQueries.listPullRequests
		.queryPromise({
			ownerLogin: owner,
			name,
			state: "open",
		})
		.catch(() => []);

	return (
		<PrListClient
			owner={owner}
			name={name}
			initialData={initialPrs}
			activePullNumber={activePullNumber}
		/>
	);
}

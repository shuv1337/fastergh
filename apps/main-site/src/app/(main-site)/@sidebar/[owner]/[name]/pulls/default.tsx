import { Suspense } from "react";
import { serverQueries } from "@/lib/server-queries";
import { PrListClient } from "../../../../_components/pr-list-client";
import { RepoListShell } from "../../../../_components/repo-list-shell";
import { ListSkeleton } from "../../../../_components/skeletons";

/**
 * Fallback for the @sidebar slot when navigating directly to /pulls/[number].
 * On soft navigation (clicking a list item), Next.js keeps the existing
 * rendered page.tsx — this default.tsx is only used for hard navigation.
 */
export default async function PrListDefault(props: {
	params: Promise<{ owner: string; name: string }>;
}) {
	const { owner, name } = await props.params;

	return (
		<RepoListShell owner={owner} name={name} activeTab="pulls">
			<Suspense fallback={<ListSkeleton />}>
				<PrListContent owner={owner} name={name} />
			</Suspense>
		</RepoListShell>
	);
}

async function PrListContent({ owner, name }: { owner: string; name: string }) {
	const initialData = await serverQueries.listPullRequests.queryPromise({
		ownerLogin: owner,
		name,
		state: "open",
	});

	return <PrListClient owner={owner} name={name} initialData={initialData} />;
}

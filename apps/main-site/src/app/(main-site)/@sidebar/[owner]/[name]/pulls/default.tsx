import { serverQueries } from "@/lib/server-queries";
import { PrListClient } from "../../../../_components/pr-list-client";
import { RepoListShell } from "../../../../_components/repo-list-shell";

/**
 * Fallback for the @sidebar slot when navigating directly to /pulls/[number].
 * On soft navigation (clicking a list item), Next.js keeps the existing
 * rendered page.tsx — this default.tsx is only used for hard navigation.
 */
export default function PrListDefault(props: {
	params: Promise<{ owner: string; name: string }>;
}) {
	return (
		<RepoListShell paramsPromise={props.params} activeTab="pulls">
			<PrListContent paramsPromise={props.params} />
		</RepoListShell>
	);
}

async function PrListContent({
	paramsPromise,
}: {
	paramsPromise: Promise<{ owner: string; name: string }>;
}) {
	const { owner, name } = await paramsPromise;
	const initialData = await serverQueries.listPullRequests.queryPromise({
		ownerLogin: owner,
		name,
		state: "open",
	});

	return <PrListClient owner={owner} name={name} initialData={initialData} />;
}

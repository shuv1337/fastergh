import { serverQueries } from "@/lib/server-queries";
import { PrListClient } from "../../../../_components/pr-list-client";
import { RepoListShell } from "../../../../_components/repo-list-shell";

export default function PrListSlot(props: {
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

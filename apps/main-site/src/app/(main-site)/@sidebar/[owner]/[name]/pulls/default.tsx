import { connection } from "next/server";
import { Suspense } from "react";
import { serverQueries } from "@/lib/server-queries";
import { PrListClient } from "../../../../_components/pr-list-client";
import { RepoListShell } from "../../../../_components/repo-list-shell";
import { SidebarClient, SidebarSkeleton } from "../../../sidebar-client";
import { SidebarRepoList } from "../../../sidebar-repo-list";

export default function PrListDefault(props: {
	params: Promise<{ owner: string; name: string }>;
}) {
	return (
		<Suspense fallback={<SidebarSkeleton />}>
			<Content paramsPromise={props.params} />
		</Suspense>
	);
}

async function Content({
	paramsPromise,
}: {
	paramsPromise: Promise<{ owner: string; name: string }>;
}) {
	await connection();
	const { owner, name } = await paramsPromise;
	const initialRepos = await serverQueries.listRepos.queryPromise({});

	if (!owner || !name || owner.length === 0 || name.length === 0) {
		return (
			<SidebarClient initialRepos={initialRepos}>
				<SidebarRepoList initialRepos={initialRepos} />
			</SidebarClient>
		);
	}

	const initialPrs = await serverQueries.listPullRequests
		.queryPromise({
			ownerLogin: owner,
			name,
			state: "open",
		})
		.catch(() => []);

	return (
		<SidebarClient initialRepos={initialRepos}>
			<RepoListShell paramsPromise={paramsPromise} activeTab="pulls">
				<PrListClient owner={owner} name={name} initialData={initialPrs} />
			</RepoListShell>
		</SidebarClient>
	);
}

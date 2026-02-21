import { connection } from "next/server";
import { Suspense } from "react";
import { serverQueries } from "@/lib/server-queries";
import { RepoListShell } from "../../../../_components/repo-list-shell";
import { ListSkeleton } from "../../../../_components/skeletons";
import { SidebarClient, SidebarSkeleton } from "../../../sidebar-client";
import { SidebarRepoList } from "../../../sidebar-repo-list";
import { FileTreeClient } from "./file-tree-client";

export default function CodeSidebarDefault(props: {
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

	if (!owner || !name) {
		return (
			<SidebarClient initialRepos={initialRepos}>
				<SidebarRepoList initialRepos={initialRepos} />
			</SidebarClient>
		);
	}

	return (
		<SidebarClient initialRepos={initialRepos}>
			<RepoListShell paramsPromise={paramsPromise} activeTab="code">
				<Suspense fallback={<ListSkeleton />}>
					<FileTreeClient owner={owner} name={name} />
				</Suspense>
			</RepoListShell>
		</SidebarClient>
	);
}

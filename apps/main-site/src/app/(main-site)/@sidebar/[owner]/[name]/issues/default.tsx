import { connection } from "next/server";
import { Suspense } from "react";
import { serverQueries } from "@/lib/server-queries";
import { IssueListClient } from "../../../../_components/issue-list-client";
import { RepoListShell } from "../../../../_components/repo-list-shell";
import { SidebarClient, SidebarSkeleton } from "../../../sidebar-client";
import { SidebarRepoList } from "../../../sidebar-repo-list";

export default function IssueListDefault(props: {
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
		<SidebarClient initialRepos={initialRepos}>
			<RepoListShell paramsPromise={paramsPromise} activeTab="issues">
				<IssueListClient
					owner={owner}
					name={name}
					initialData={initialData}
					repositoryId={overview?.repositoryId ?? null}
				/>
			</RepoListShell>
		</SidebarClient>
	);
}

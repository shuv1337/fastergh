"use client";

import { useParams, usePathname } from "next/navigation";
import { useMemo } from "react";
import { IssueListClient } from "./issue-list-client";
import { PrListClient } from "./pr-list-client";
import { RepoTabBar } from "./repo-tab-bar";
import { SidebarRepoList } from "./sidebar-repo-list";
import { WorkflowRunListClient } from "./workflow-run-list-client";

/**
 * Client-side sidebar content router.
 *
 * Reads the current URL via `useParams()` / `usePathname()` and renders
 * the appropriate sidebar body. Because this is entirely client-side,
 * navigations never trigger server-side Suspense in the sidebar.
 *
 * Route mapping:
 *   /                          → repo list
 *   /notifications             → repo list
 *   /:owner                    → repo list (activeOwner)
 *   /:owner/:name              → PR list (default tab)
 *   /:owner/:name/pulls        → PR list
 *   /:owner/:name/pull/:number → PR list (active number)
 *   /:owner/:name/issues       → issue list
 *   /:owner/:name/issues/:num  → issue list (active number)
 *   /:owner/:name/issues/new   → issue list
 *   /:owner/:name/actions      → workflow run list
 *   /:owner/:name/actions/runs/:runId → workflow run list (active)
 *   /:owner/:name/tree/...     → file tree (code tab)
 *   /:owner/:name/blob/...     → file tree (code tab)
 *   /:owner/:name/activity     → PR list (default tab)
 */
export function SidebarRouter() {
	const params = useParams<{
		owner?: string;
		name?: string;
		number?: string;
		runId?: string;
	}>();
	const pathname = usePathname();

	const owner = params.owner ?? null;
	const name = params.name ?? null;

	// Derive the route from pathname — must be above any early returns
	// so hooks are called unconditionally.
	const repoPrefix = owner && name ? `/${owner}/${name}` : "";
	const rest = owner && name ? pathname.slice(repoPrefix.length) : "";
	const route = useMemo(() => parseRepoRoute(rest), [rest]);

	// No repo context — show repo list
	if (!owner || !name) {
		return <SidebarRepoList initialRepos={[]} activeOwner={owner} />;
	}

	switch (route.tab) {
		case "issues":
			return (
				<>
					<RepoTabBar owner={owner} name={name} activeTab="issues" />
					<IssueListClient
						owner={owner}
						name={name}
						repositoryId={null}
						activeIssueNumber={route.activeNumber}
					/>
				</>
			);

		case "actions":
			return (
				<>
					<RepoTabBar owner={owner} name={name} activeTab="actions" />
					<WorkflowRunListClient
						owner={owner}
						name={name}
						activeRunNumber={route.activeNumber}
					/>
				</>
			);

		// Code tab disabled — falls through to default (pulls)

		default:
			return (
				<>
					<RepoTabBar owner={owner} name={name} activeTab="pulls" />
					<PrListClient
						owner={owner}
						name={name}
						activePullNumber={route.activeNumber}
					/>
				</>
			);
	}
}

type RepoRoute = {
	tab: "pulls" | "issues" | "actions";
	activeNumber: number | null;
};

function parseRepoRoute(rest: string): RepoRoute {
	// /pulls or empty → pulls tab
	if (rest === "" || rest === "/" || rest.startsWith("/pulls")) {
		return { tab: "pulls", activeNumber: null };
	}

	// /pull/:number → pulls tab with active
	if (rest.startsWith("/pull/")) {
		const num = Number.parseInt(rest.split("/")[2] ?? "", 10);
		return {
			tab: "pulls",
			activeNumber: Number.isNaN(num) ? null : num,
		};
	}

	// /issues/new → issues tab
	if (rest === "/issues/new") {
		return { tab: "issues", activeNumber: null };
	}

	// /issues/:number → issues tab with active
	if (rest.startsWith("/issues/")) {
		const num = Number.parseInt(rest.split("/")[2] ?? "", 10);
		return {
			tab: "issues",
			activeNumber: Number.isNaN(num) ? null : num,
		};
	}

	// /issues → issues tab
	if (rest === "/issues") {
		return { tab: "issues", activeNumber: null };
	}

	// /actions/runs/:runId → actions tab with active
	if (rest.startsWith("/actions/runs/")) {
		const num = Number.parseInt(rest.split("/")[3] ?? "", 10);
		return {
			tab: "actions",
			activeNumber: Number.isNaN(num) ? null : num,
		};
	}

	// /actions → actions tab
	if (rest.startsWith("/actions")) {
		return { tab: "actions", activeNumber: null };
	}

	// /tree/... or /blob/... → code tab (disabled, fall through to pulls)
	// if (rest.startsWith("/tree/") || rest.startsWith("/blob/")) {
	// 	return { tab: "code", activeNumber: null };
	// }

	// /activity → falls through to pulls (default)
	return { tab: "pulls", activeNumber: null };
}

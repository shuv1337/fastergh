import { Skeleton } from "@packages/ui/components/skeleton";
import { type ReactNode, Suspense } from "react";
import { serverQueries } from "@/lib/server-queries";
import { SidebarClient } from "../@sidebar/sidebar-client";
import { RepoNavSelector } from "./repo-nav-selector";

/**
 * Sidebar chrome: nav selector at the top, slot children in the body.
 *
 * The nav selector derives owner/name/activeTab from the URL client-side,
 * so no context threading is required from the server.
 */
export function MainSiteSidebar({ children }: { children: ReactNode }) {
	return (
		<SidebarClient
			navSelector={
				<Suspense fallback={<NavSelectorFallback />}>
					<NavSelectorContent />
				</Suspense>
			}
		>
			{children}
		</SidebarClient>
	);
}

async function NavSelectorContent() {
	const initialRepos = await serverQueries.listRepos.queryPromise({});

	return <RepoNavSelector initialRepos={initialRepos} />;
}

function NavSelectorFallback() {
	return (
		<div className="shrink-0 px-2 pt-2.5 pb-1.5 border-b border-sidebar-border">
			<Skeleton className="h-8 w-full rounded-sm" />
		</div>
	);
}

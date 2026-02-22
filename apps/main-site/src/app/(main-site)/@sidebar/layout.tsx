import { Skeleton } from "@packages/ui/components/skeleton";
import { connection } from "next/server";
import { type ReactNode, Suspense } from "react";
import { serverQueries } from "@/lib/server-queries";
import { SidebarClient } from "./sidebar-client";
import { NavSelectorSlot } from "./sidebar-nav-selector-slot";

/**
 * Persistent sidebar layout.
 *
 * The default export is **sync** — it renders `SidebarClient` immediately.
 * The nav selector data is fetched in a separate async component inside its
 * own Suspense boundary, so changing `{children}` (route navigation) never
 * re-suspends the sidebar shell.
 */
export default function SidebarLayout({ children }: { children: ReactNode }) {
	return (
		<SidebarClient
			navSelector={
				<Suspense
					fallback={
						<div className="shrink-0 px-2 pt-2.5 pb-1.5 border-b border-sidebar-border">
							<Skeleton className="h-8 w-full rounded-sm" />
						</div>
					}
				>
					<NavSelectorContent />
				</Suspense>
			}
		>
			{children}
		</SidebarClient>
	);
}

async function NavSelectorContent() {
	await connection();
	const initialRepos = await serverQueries.listRepos.queryPromise({});

	if (initialRepos.length === 0) {
		return null;
	}

	return (
		<div className="shrink-0 border-b border-sidebar-border">
			<NavSelectorSlot initialRepos={initialRepos} />
		</div>
	);
}

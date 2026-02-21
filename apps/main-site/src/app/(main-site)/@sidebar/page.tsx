import { connection } from "next/server";
import { Suspense } from "react";
import { serverQueries } from "@/lib/server-queries";
import { SidebarClient, SidebarSkeleton } from "./sidebar-client";

/**
 * Root page for the @sidebar slot — shows the repository list at "/".
 * This must exist as a page.tsx (not just default.tsx) so that navigating
 * back to "/" from a nested route like /owner/name/pulls properly
 * resolves the parallel route instead of showing a stale slot.
 */
export default function SidebarSlot() {
	return (
		<Suspense fallback={<SidebarSkeleton />}>
			<SidebarContent />
		</Suspense>
	);
}

async function SidebarContent() {
	await connection();
	const initialRepos = await serverQueries.listRepos.queryPromise({});
	return <SidebarClient initialRepos={initialRepos} />;
}

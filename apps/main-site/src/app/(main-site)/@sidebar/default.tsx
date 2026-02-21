import { connection } from "next/server";
import { Suspense } from "react";
import { serverQueries } from "@/lib/server-queries";
import { SidebarClient, SidebarSkeleton } from "./sidebar-client";

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

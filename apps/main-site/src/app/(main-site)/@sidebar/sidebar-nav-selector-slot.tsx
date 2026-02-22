"use client";

import { usePathname } from "next/navigation";
import { RepoNavSelector } from "../_components/repo-nav-selector";
import type { SidebarRepo } from "./sidebar-client";

/**
 * Thin client wrapper that reads the current pathname to derive
 * the active owner/name for the nav selector.
 */
export function NavSelectorSlot({
	initialRepos,
}: {
	initialRepos: ReadonlyArray<SidebarRepo>;
}) {
	const pathname = usePathname();
	const segments = pathname.split("/").filter(Boolean);
	const activeOwner = segments[0] ?? null;
	const activeName = segments[1] ?? null;

	return (
		<RepoNavSelector
			owner={activeOwner}
			name={activeName}
			initialRepos={initialRepos}
		/>
	);
}

"use client";

import { Button } from "@packages/ui/components/button";
import { Skeleton } from "@packages/ui/components/skeleton";
import { UserButton } from "@packages/ui/components/user-button";
import { GitHubIcon } from "@packages/ui/icons/index";
import { authClient } from "@packages/ui/lib/auth-client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { InstallGitHubAppButton } from "../_components/install-github-app-button";
import { RepoNavSelector } from "../_components/repo-nav-selector";

export type SidebarRepo = {
	repositoryId: number;
	fullName: string;
	ownerLogin: string;
	ownerAvatarUrl: string | null;
	name: string;
	openPrCount: number;
	openIssueCount: number;
	failingCheckCount: number;
	lastPushAt: number | null;
	updatedAt: number;
};

// ---------------------------------------------------------------------------
// Universal sidebar shell — used on every page.
//
//   ┌─────────────────────┐
//   │  RepoNavSelector     │
//   ├─────────────────────┤
//   │  children (body)     │  ← swapped per route
//   ├─────────────────────┤
//   │  Install GitHub App  │
//   │  QuickHub GitHub     │
//   │  UserButton / CTA    │
//   └─────────────────────┘
// ---------------------------------------------------------------------------

export function SidebarClient({
	initialRepos,
	children,
}: {
	initialRepos: ReadonlyArray<SidebarRepo>;
	children: ReactNode;
}) {
	const session = authClient.useSession();
	const pathname = usePathname();
	const segments = pathname.split("/").filter(Boolean);
	const activeOwner = segments[0] ?? null;
	const activeName = segments[1] ?? null;

	return (
		<div className="flex h-full flex-col bg-sidebar">
			{/* Top: nav selector */}
			{initialRepos.length > 0 && (
				<div className="shrink-0 border-b border-sidebar-border">
					<RepoNavSelector
						owner={activeOwner}
						name={activeName}
						initialRepos={initialRepos}
					/>
				</div>
			)}

			{/* Body — swapped per route */}
			<div className="flex-1 overflow-y-auto">{children}</div>

			{/* Bottom: install + repo link + auth */}
			<div className="shrink-0 border-t border-sidebar-border px-2 py-1.5 space-y-1.5">
				<Button
					asChild
					size="sm"
					variant="ghost"
					className="h-6 text-[10px] w-full text-muted-foreground/50 hover:text-muted-foreground"
				>
					<a
						href="https://github.com/RhysSullivan/quickhub"
						target="_blank"
						rel="noopener noreferrer"
					>
						<GitHubIcon className="size-2.5" />
						Star on GitHub
					</a>
				</Button>
				<InstallGitHubAppButton
					size="sm"
					variant="outline"
					className="h-6 text-[10px] w-full"
					iconClassName="size-2.5"
				/>
				{session.isPending ? (
					<Skeleton className="h-7 w-full rounded-md" />
				) : session.data ? (
					<UserButton />
				) : (
					<Button
						size="sm"
						className="w-full h-7 text-[11px] gap-1"
						onClick={() => {
							authClient.signIn.social({ provider: "github" });
						}}
					>
						<GitHubIcon className="size-3" />
						Sign in
					</Button>
				)}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function SidebarSkeleton() {
	return (
		<div className="flex h-full flex-col bg-sidebar">
			<div className="shrink-0 px-2 pt-2.5 pb-1.5 border-b border-sidebar-border">
				<Skeleton className="h-8 w-full rounded-sm" />
			</div>
			<div className="flex-1 overflow-y-auto">
				<div className="space-y-px py-1 px-2">
					{[1, 2, 3, 4, 5, 6, 7].map((i) => (
						<Skeleton key={i} className="h-5 w-full rounded-sm" />
					))}
				</div>
			</div>
			<div className="shrink-0 border-t border-sidebar-border px-2 py-1.5">
				<Skeleton className="h-5 w-14 rounded-sm" />
			</div>
		</div>
	);
}

"use client";

import { Button } from "@packages/ui/components/button";
import { Search } from "@packages/ui/components/icons";
import { Skeleton } from "@packages/ui/components/skeleton";
import { UserButton } from "@packages/ui/components/user-button";
import { GitHubIcon } from "@packages/ui/icons/index";
import { authClient } from "@packages/ui/lib/auth-client";
import type { ReactNode } from "react";
import { InstallGitHubAppButton } from "../_components/install-github-app-button";
import { triggerOpenSearchCommand } from "../_components/search-command-events";

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
//   │  navSelector (slot)  │  ← Suspense-wrapped async, independent of children
//   ├─────────────────────┤
//   │  children (body)     │  ← swapped per route
//   ├─────────────────────┤
//   │  Install GitHub App  │
//   │  QuickHub GitHub     │
//   │  UserButton / CTA    │
//   └─────────────────────┘
// ---------------------------------------------------------------------------

export function SidebarClient({
	navSelector,
	children,
}: {
	navSelector: ReactNode;
	children: ReactNode;
}) {
	const session = authClient.useSession();

	return (
		<div className="flex h-full flex-col bg-sidebar">
			{/* Top: nav selector — rendered as a slot so it streams independently */}
			{navSelector}

			{/* Mobile search trigger — opens full desktop-style command palette */}
			<div className="md:hidden shrink-0 border-b border-sidebar-border px-2 py-2">
				<Button
					variant="outline"
					className="h-9 w-full items-center justify-start gap-2 rounded-lg border-sidebar-border bg-background/70 px-2.5 text-left"
					onClick={() => {
						triggerOpenSearchCommand();
					}}
				>
					<Search className="size-3.5 shrink-0 text-muted-foreground" />
					<div className="min-w-0 flex-1">
						<div className="truncate text-[12px] font-medium text-foreground">
							Search QuickHub
						</div>
					</div>
				</Button>
			</div>

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

import { Skeleton } from "@packages/ui/components/skeleton";
import { cacheLife } from "next/cache";
import { type ReactNode, Suspense } from "react";
import { serverQueries } from "@/lib/server-queries";
import type { DashboardData } from "./_components/home-dashboard-client";
import {
	CommandPaletteClient,
	IssuesColumnClient,
	PrColumnClient,
	ReposColumnClient,
	SignInCta,
} from "./_components/home-dashboard-client";

/**
 * Home dashboard page.
 *
 * Entry component creates dynamic slots; cached shell renders the layout.
 */
export default function HomePage() {
	return (
		<DashboardShell
			commandPalette={
				<Suspense fallback={<Skeleton className="h-10 w-full rounded-lg" />}>
					<CommandPaletteSection />
				</Suspense>
			}
			prColumn={
				<Suspense fallback={<ColumnSkeleton />}>
					<PrColumnSection />
				</Suspense>
			}
			issuesColumn={
				<Suspense fallback={<ColumnSkeleton />}>
					<IssuesColumnSection />
				</Suspense>
			}
			reposColumn={
				<Suspense fallback={<ColumnSkeleton />}>
					<ReposColumnSection />
				</Suspense>
			}
		/>
	);
}

/** Cached static shell — deterministic layout, no request-specific data. */
async function DashboardShell({
	commandPalette,
	prColumn,
	issuesColumn,
	reposColumn,
}: {
	commandPalette: ReactNode;
	prColumn: ReactNode;
	issuesColumn: ReactNode;
	reposColumn: ReactNode;
}) {
	"use cache";
	cacheLife("max");

	return (
		<div className="h-full overflow-y-auto bg-dotgrid">
			<div className="mx-auto max-w-400 px-4 py-4 md:px-6 md:py-5">
				{/* Command palette */}
				<div className="mb-4">{commandPalette}</div>

				{/* Sign-in CTA — renders nothing if signed in */}
				<SignInCta />

				{/* Three-column grid */}
				<div className="grid gap-4 lg:grid-cols-3">
					<div key="pr">{prColumn}</div>
					<div key="issues">{issuesColumn}</div>
					<div key="repos">{reposColumn}</div>
				</div>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Async server components — each fetches the same (deduped) query
// ---------------------------------------------------------------------------

async function fetchDashboard(): Promise<DashboardData> {
	return serverQueries.getHomeDashboard.queryPromise({});
}

async function CommandPaletteSection() {
	const data = await fetchDashboard();
	return <CommandPaletteClient initialData={data} query={{}} />;
}

async function PrColumnSection() {
	const data = await fetchDashboard();
	return <PrColumnClient initialData={data} query={{}} />;
}

async function IssuesColumnSection() {
	const data = await fetchDashboard();
	return <IssuesColumnClient initialData={data} query={{}} />;
}

async function ReposColumnSection() {
	const data = await fetchDashboard();
	return <ReposColumnClient initialData={data} query={{}} />;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function ColumnSkeleton() {
	return (
		<div className="space-y-0">
			<Skeleton className="mb-1.5 h-4 w-28" />
			<Skeleton className="h-72 rounded-lg" />
		</div>
	);
}

import { Skeleton } from "@packages/ui/components/skeleton";
import { connection } from "next/server";
import { Suspense } from "react";
import { serverQueries } from "@/lib/server-queries";
import type { DashboardData } from "./home-dashboard-client";
import {
	CommandPaletteClient,
	IssuesColumnClient,
	PrColumnClient,
	ReposColumnClient,
	SignInCta,
} from "./home-dashboard-client";

export default function DetailDefault() {
	return (
		<div className="h-full overflow-y-auto bg-dotgrid">
			<div className="mx-auto max-w-[1600px] px-4 py-4 md:px-6 md:py-5">
				{/* Command palette */}
				<div className="mb-4">
					<Suspense fallback={<Skeleton className="h-10 w-full rounded-lg" />}>
						<CommandPaletteSection />
					</Suspense>
				</div>

				{/* Sign-in CTA — renders nothing if signed in */}
				<SignInCta />

				{/* Three-column grid */}
				<div className="grid gap-4 lg:grid-cols-3">
					<Suspense fallback={<ColumnSkeleton />}>
						<PrColumnSection />
					</Suspense>
					<Suspense fallback={<ColumnSkeleton />}>
						<IssuesColumnSection />
					</Suspense>
					<Suspense fallback={<ColumnSkeleton />}>
						<ReposColumnSection />
					</Suspense>
				</div>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Async server components — each fetches the same (deduped) query
// ---------------------------------------------------------------------------

async function fetchDashboard(): Promise<DashboardData> {
	await connection();
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

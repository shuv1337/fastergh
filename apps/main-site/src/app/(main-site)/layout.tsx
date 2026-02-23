import { Providers } from "@packages/ui/components/providers";
import type { Metadata } from "next";
import { type ReactNode, Suspense } from "react";
import { HubShell } from "./_components/hub-shell";
import { MainSiteSidebar } from "./_components/main-site-sidebar";

export const metadata: Metadata = {
	title: "QuickHub — GitHub Mirror",
	description: "Fast GitHub browsing backed by Convex real-time projections",
};

function SidebarShellFallback() {
	return <div className="h-full animate-pulse bg-sidebar/60" />;
}

function DetailShellFallback() {
	return <div className="h-full animate-pulse bg-background" />;
}

/**
 * Root layout for the main site.
 *
 * Uses Next.js parallel routes: `@sidebar` and `@detail` are rendered as
 * independent slots within `HubShell`. The sidebar persists across navigations
 * — only the detail panel re-renders when clicking between items.
 *
 * `children` is the default slot (maps to `page.tsx` files) and is not rendered
 * since all visual content flows through the parallel route slots.
 */
export default function MainSiteLayout({
	children: _children,
	sidebar,
	detail,
}: {
	children: ReactNode;
	sidebar: ReactNode;
	detail: ReactNode;
}) {
	return (
		<Providers>
			<HubShell
				sidebar={
					<Suspense fallback={<SidebarShellFallback />}>
						<MainSiteSidebar>{sidebar}</MainSiteSidebar>
					</Suspense>
				}
				detail={
					<Suspense fallback={<DetailShellFallback />}>{detail}</Suspense>
				}
			/>
		</Providers>
	);
}

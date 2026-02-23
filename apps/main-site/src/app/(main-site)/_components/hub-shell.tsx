"use client";

import { Button } from "@packages/ui/components/button";
import { PanelLeftIcon } from "@packages/ui/components/icons";
import { KeyboardShortcutsDialog } from "@packages/ui/components/keyboard-shortcuts-dialog";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@packages/ui/components/resizable";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@packages/ui/components/sheet";
import { useHotkey } from "@tanstack/react-hotkeys";
import {
	type ComponentRef,
	createContext,
	type ReactNode,
	Suspense,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import { SearchCommand } from "./search-command";

type SidebarPanelRef = ComponentRef<typeof ResizablePanel>;

// ---------------------------------------------------------------------------
// Hub sidebar context — allows child components to toggle the app sidebar
// ---------------------------------------------------------------------------

type HubSidebarContextValue = {
	toggleSidebar: () => void;
};

const HubSidebarContext = createContext<HubSidebarContextValue>({
	toggleSidebar: () => {},
});

export function useHubSidebar() {
	return useContext(HubSidebarContext);
}

export function HubShell({
	sidebar,
	detail,
}: {
	sidebar: ReactNode;
	detail: ReactNode;
}) {
	const sidebarPanelRef = useRef<SidebarPanelRef>(null);
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

	const toggleSidebar = useCallback(() => {
		if (
			typeof window !== "undefined" &&
			window.matchMedia("(max-width: 767px)").matches
		) {
			setMobileSidebarOpen((isOpen) => !isOpen);
			return;
		}

		const panel = sidebarPanelRef.current;
		if (panel === null) return;
		if (panel.isCollapsed()) {
			panel.expand();
		} else {
			panel.collapse();
		}
	}, []);

	useHotkey("[", (event) => {
		event.preventDefault();
		toggleSidebar();
	});

	const contextValue = useMemo<HubSidebarContextValue>(
		() => ({ toggleSidebar }),
		[toggleSidebar],
	);

	return (
		<HubSidebarContext.Provider value={contextValue}>
			<div className="h-dvh w-full bg-background">
				{/* Desktop: two-panel resizable */}
				<div className="hidden md:block h-full">
					<ResizablePanelGroup direction="horizontal" className="h-full">
						{/* Panel 1: Sidebar (repos or list) */}
						<ResizablePanel
							ref={sidebarPanelRef}
							defaultSize={18}
							minSize={11}
							maxSize={28}
							collapsible
							collapsedSize={0}
							className="border-r border-border/60"
						>
							{sidebar}
						</ResizablePanel>

						<ResizableHandle />

						{/* Panel 2: Detail/Content */}
						<ResizablePanel defaultSize={82} minSize={60} className="min-w-0">
							{detail}
						</ResizablePanel>
					</ResizablePanelGroup>
				</div>

				{/* Mobile: detail content + toggleable sidebar sheet */}
				<div className="md:hidden h-full">
					<div className="flex h-full min-h-0 flex-col">
						<div className="shrink-0 border-b border-border/60 px-2 py-2">
							<Button
								variant="outline"
								size="sm"
								className="h-8 gap-1.5"
								onClick={() => {
									setMobileSidebarOpen(true);
								}}
							>
								<PanelLeftIcon className="size-3.5" />
								Sidebar
							</Button>
						</div>
						<div className="min-h-0 flex-1">{detail}</div>
					</div>

					<Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
						<SheetContent
							side="left"
							className="w-[min(22rem,90vw)] p-0 [&>button]:hidden"
						>
							<SheetHeader className="sr-only">
								<SheetTitle>Sidebar</SheetTitle>
								<SheetDescription>
									Displays the FasterGH sidebar.
								</SheetDescription>
							</SheetHeader>
							<div className="h-full">{sidebar}</div>
						</SheetContent>
					</Sheet>
				</div>

				<Suspense fallback={null}>
					<SearchCommand />
				</Suspense>
				<KeyboardShortcutsDialog />
			</div>
		</HubSidebarContext.Provider>
	);
}

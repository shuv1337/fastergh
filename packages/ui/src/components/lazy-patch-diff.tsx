"use client";

import type { PatchDiffProps } from "@pierre/diffs/react";
import { PatchDiff } from "@pierre/diffs/react";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Mount queue — ensures only one diff mounts per idle callback so large
// PRs don't jam the main thread by mounting many diffs simultaneously.
// ---------------------------------------------------------------------------

type MountCallback = () => void;

interface DiffMountQueue {
	enqueue(cb: MountCallback): () => void;
}

function createDiffMountQueue(): DiffMountQueue {
	const queue: Array<{ cb: MountCallback; cancelled: boolean }> = [];
	let draining = false;

	function drain() {
		if (draining) return;
		draining = true;

		function step() {
			// Skip cancelled entries
			while (queue.length > 0 && queue[0]!.cancelled) {
				queue.shift();
			}
			if (queue.length === 0) {
				draining = false;
				return;
			}
			const entry = queue.shift()!;
			if (!entry.cancelled) {
				entry.cb();
			}
			// Yield to the browser between each mount
			if ("requestIdleCallback" in window) {
				requestIdleCallback(step, { timeout: 80 });
			} else {
				setTimeout(step, 16);
			}
		}

		if ("requestIdleCallback" in window) {
			requestIdleCallback(step, { timeout: 80 });
		} else {
			setTimeout(step, 16);
		}
	}

	return {
		enqueue(cb: MountCallback) {
			const entry = { cb, cancelled: false };
			queue.push(entry);
			drain();
			return () => {
				entry.cancelled = true;
			};
		},
	};
}

const DiffMountQueueContext = createContext<DiffMountQueue | null>(null);

export function DiffMountQueueProvider({ children }: { children: ReactNode }) {
	const queueRef = useRef<DiffMountQueue | null>(null);
	if (queueRef.current === null) {
		queueRef.current = createDiffMountQueue();
	}
	return (
		<DiffMountQueueContext.Provider value={queueRef.current}>
			{children}
		</DiffMountQueueContext.Provider>
	);
}

// ---------------------------------------------------------------------------
// useLazyDiffMount — viewport-aware + staggered mounting hook
// ---------------------------------------------------------------------------

/**
 * Returns a ref to attach to a sentinel element and a boolean indicating
 * whether the diff should be mounted. The diff only mounts when the sentinel
 * enters the viewport (with configurable rootMargin) and is staggered through
 * the DiffMountQueue to avoid jamming the main thread.
 */
export function useLazyDiffMount(rootMargin = "300px") {
	const sentinelRef = useRef<HTMLDivElement>(null);
	const [shouldMount, setShouldMount] = useState(false);
	const mountQueue = useContext(DiffMountQueueContext);

	useEffect(() => {
		const el = sentinelRef.current;
		if (!el || shouldMount) return;

		let cancelQueue = () => {};

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						observer.disconnect();
						if (mountQueue) {
							cancelQueue = mountQueue.enqueue(() => setShouldMount(true));
						} else {
							setShouldMount(true);
						}
					}
				}
			},
			{ rootMargin },
		);

		observer.observe(el);
		return () => {
			observer.disconnect();
			cancelQueue();
		};
	}, [shouldMount, rootMargin, mountQueue]);

	return { sentinelRef, shouldMount };
}

// ---------------------------------------------------------------------------
// Placeholder shown while the diff is deferred
// ---------------------------------------------------------------------------

export function DiffPlaceholder({
	sentinelRef,
	lineCount,
}: {
	sentinelRef: React.RefObject<HTMLDivElement | null>;
	lineCount?: number;
}) {
	// Estimate ~20px per line for a rough placeholder height
	const estimatedHeight = lineCount !== undefined ? lineCount * 20 : undefined;
	return (
		<div
			ref={sentinelRef}
			className="flex items-center justify-center text-xs text-muted-foreground bg-muted/10"
			style={
				estimatedHeight !== undefined
					? { minHeight: `${String(estimatedHeight)}px` }
					: { padding: "2rem 0" }
			}
		>
			&nbsp;
		</div>
	);
}

// ---------------------------------------------------------------------------
// LazyPatchDiff — convenience wrapper for PatchDiff with lazy mounting
// ---------------------------------------------------------------------------

interface LazyPatchDiffProps<LAnnotation = undefined>
	extends Omit<PatchDiffProps<LAnnotation>, "patch"> {
	patch: string;
	/** How many pixels before the element enters the viewport to start loading */
	rootMargin?: string;
}

export function LazyPatchDiff<LAnnotation = undefined>({
	patch,
	rootMargin = "300px",
	...patchDiffProps
}: LazyPatchDiffProps<LAnnotation>) {
	const { sentinelRef, shouldMount } = useLazyDiffMount(rootMargin);

	if (!shouldMount) {
		return <DiffPlaceholder sentinelRef={sentinelRef} />;
	}

	return <PatchDiff patch={patch} {...patchDiffProps} />;
}

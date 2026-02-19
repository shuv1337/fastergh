"use client";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import type React from "react";
import {
	type RefCallback,
	useCallback,
	useRef,
	useSyncExternalStore,
} from "react";
import { cn } from "../lib/utils";

function isExternalUrl(href: string): boolean {
	return href.startsWith("http://") || href.startsWith("https://");
}

/**
 * Detects if the device has a coarse pointer (touch screen).
 * Uses useSyncExternalStore so all Link instances share one subscription
 * instead of each running their own useState + useEffect.
 */
function subscribeToPointer(onStoreChange: () => void) {
	const mql = window.matchMedia("(pointer: coarse)");
	mql.addEventListener("change", onStoreChange);
	return () => mql.removeEventListener("change", onStoreChange);
}
function getIsTouchDevice() {
	return window.matchMedia("(pointer: coarse)").matches;
}
function getServerSnapshot() {
	return false;
}
function useIsTouchDevice() {
	return useSyncExternalStore(
		subscribeToPointer,
		getIsTouchDevice,
		getServerSnapshot,
	);
}

/**
 * On touch devices, prefetch links when they enter the viewport.
 * Returns a ref callback to attach to the link element.
 */
function useViewportPrefetch(
	href: string,
	enabled: boolean,
): RefCallback<HTMLAnchorElement> {
	const router = useRouter();
	const prefetched = useRef(false);

	return useCallback(
		(node: HTMLAnchorElement | null) => {
			if (!enabled || !node || prefetched.current) return;

			const observer = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (entry.isIntersecting && !prefetched.current) {
							prefetched.current = true;
							router.prefetch(href);
							observer.disconnect();
						}
					}
				},
				{ rootMargin: "200px" },
			);

			observer.observe(node);

			// Cleanup when the node is removed from the DOM
			return () => observer.disconnect();
		},
		[href, enabled, router],
	);
}

function InternalLink({
	icon,
	className,
	...rest
}: React.ComponentPropsWithoutRef<typeof NextLink> & {
	href: string;
	icon?: React.ReactNode;
}) {
	const router = useRouter();
	const isTouch = useIsTouchDevice();
	const href = rest.href;
	const viewportRef = useViewportPrefetch(href, isTouch);
	const prefetched = useRef(false);

	const handlePointerEnter = useCallback(() => {
		// On desktop, prefetch on hover intent
		if (!isTouch && !prefetched.current) {
			prefetched.current = true;
			router.prefetch(href);
		}
	}, [isTouch, href, router]);

	const sharedProps = {
		scroll: true as const,
		prefetch: false as const,
		onPointerEnter: handlePointerEnter,
		...rest,
	};

	if (icon) {
		return (
			<NextLink
				{...sharedProps}
				ref={viewportRef}
				className={cn("flex flex-row items-center gap-2", className)}
			>
				{icon}
				{rest.children}
			</NextLink>
		);
	}

	return (
		<NextLink {...sharedProps} ref={viewportRef} className={className}>
			{rest.children}
		</NextLink>
	);
}

export function Link(
	props: React.ComponentPropsWithoutRef<typeof NextLink> & {
		href: string;
		icon?: React.ReactNode;
	},
) {
	const { icon, className, ...rest } = props;
	const isExternal = isExternalUrl(rest.href);

	if (isExternal) {
		const { prefetch, replace, scroll, shallow, passHref, ...anchorProps } =
			rest;
		if (icon) {
			return (
				<a
					{...anchorProps}
					href={rest.href}
					target="_blank"
					rel="noopener noreferrer"
					className={cn("flex flex-row items-center gap-2", className)}
				>
					{props.icon}
					{props.children}
				</a>
			);
		}
		return (
			<a
				{...anchorProps}
				href={rest.href}
				target="_blank"
				rel="noopener noreferrer"
				className={className}
			>
				{props.children}
			</a>
		);
	}

	return <InternalLink icon={icon} className={className} {...rest} />;
}

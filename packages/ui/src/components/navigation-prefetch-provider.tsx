"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";

type PrefetchParamValue = string | number | boolean | null;

export type NavigationPrefetchParams = Record<
	string,
	PrefetchParamValue | undefined
>;

export type NavigationPrefetchIntent = {
	readonly key: string;
	readonly params?: NavigationPrefetchParams;
};

export type NavigationPrefetchRequest = {
	readonly href: string;
	readonly intent?: NavigationPrefetchIntent;
};

type PrefetchRequest = (
	request: NavigationPrefetchRequest,
) => void | Promise<void>;

const noopPrefetch: PrefetchRequest = () => undefined;

const NavigationPrefetchContext = createContext<PrefetchRequest>(noopPrefetch);

export function NavigationPrefetchProvider({
	children,
	prefetchRequest,
}: {
	children: ReactNode;
	prefetchRequest: PrefetchRequest;
}) {
	const value = useMemo(() => prefetchRequest, [prefetchRequest]);

	return (
		<NavigationPrefetchContext.Provider value={value}>
			{children}
		</NavigationPrefetchContext.Provider>
	);
}

export function useNavigationPrefetch() {
	return useContext(NavigationPrefetchContext);
}

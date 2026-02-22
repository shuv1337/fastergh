"use client";

import { useSyncExternalStore } from "react";

const subscribe = (onStoreChange: () => void) => {
	window.addEventListener("popstate", onStoreChange);
	window.addEventListener("quickhub:navigation", onStoreChange);
	return () => {
		window.removeEventListener("popstate", onStoreChange);
		window.removeEventListener("quickhub:navigation", onStoreChange);
	};
};

const getSnapshot = () => window.location.pathname;

const getServerSnapshot = () => "/";

export const useCurrentPathname = (): string =>
	useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

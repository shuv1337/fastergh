"use client";

import type { Atom } from "@effect-atom/atom";
import { Result, useAtom } from "@effect-atom/atom-react";
import { Option, pipe } from "effect";
import { useEffect, useRef } from "react";

export function usePaginatedAtom<T, E>(
	atom: Atom.Writable<Atom.PullResult<T, E>, void>,
) {
	const [pullResult, loadMore] = useAtom(atom);

	const { items, done } = pipe(
		Result.value(pullResult),
		Option.getOrElse(() => ({ items: [] as Array<T>, done: true })),
	);

	const error = pipe(Result.error(pullResult), Option.getOrNull);

	return {
		items,
		done,
		loadMore,
		isLoading: Result.isWaiting(pullResult),
		isInitial: Result.isInitial(pullResult),
		isError: Result.isFailure(pullResult),
		error,
		hasMore: !done,
	};
}

type UseInfinitePaginationOptions = {
	threshold?: number;
	rootMargin?: string;
};

export function useInfinitePagination<T, E>(
	atom: Atom.Writable<Atom.PullResult<T, E>, void>,
	options?: UseInfinitePaginationOptions,
) {
	const pagination = usePaginatedAtom(atom);
	const sentinelRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel || !pagination.hasMore || pagination.isLoading) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					pagination.loadMore();
				}
			},
			{
				threshold: options?.threshold ?? 0,
				rootMargin: options?.rootMargin ?? "100px",
			},
		);

		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [
		pagination.hasMore,
		pagination.isLoading,
		pagination.loadMore,
		options?.threshold,
		options?.rootMargin,
	]);

	return { ...pagination, sentinelRef };
}

/**
 * Like {@link useInfinitePagination} but shows server-prefetched `initialData`
 * while the paginated atom is still loading its first page.  Once the atom
 * has real data the initial data is discarded and the atom takes over.
 */
export function useInfinitePaginationWithInitial<T, E>(
	atom: Atom.Writable<Atom.PullResult<T, E>, void>,
	initialData: ReadonlyArray<T>,
	options?: UseInfinitePaginationOptions,
) {
	const pagination = useInfinitePagination(atom, options);

	// While the atom hasn't produced any items yet, show the prefetched data.
	if (
		pagination.isInitial ||
		(pagination.isLoading && pagination.items.length === 0)
	) {
		return {
			...pagination,
			items: initialData as Array<T>,
			// We don't know if there are more pages beyond the prefetched data,
			// but assume there are so the sentinel triggers the first real fetch.
			hasMore: true,
			done: false,
		};
	}

	return pagination;
}

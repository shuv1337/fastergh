import {
	createSearchParamsCache,
	parseAsString,
	parseAsStringLiteral,
} from "nuqs/server";

/** Available tabs on the repo detail page */
export const REPO_TABS = ["pulls", "issues", "activity"] as const;
export type RepoTab = (typeof REPO_TABS)[number];

/** State filter values for PR and issue lists */
export const STATE_FILTERS = ["all", "open", "closed"] as const;
export type StateFilter = (typeof STATE_FILTERS)[number];

/** Shared parsers for repo detail page URL state */
export const repoDetailParsers = {
	tab: parseAsStringLiteral(REPO_TABS).withDefault("pulls"),
	state: parseAsStringLiteral(STATE_FILTERS).withDefault("open"),
};

/** Server-side search params cache for the repo detail page */
export const repoDetailSearchParamsCache =
	createSearchParamsCache(repoDetailParsers);

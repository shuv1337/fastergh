const getBrowserWindow = (): Window | null =>
	typeof window === "undefined" ? null : window;

const QUICKHUB_NAVIGATE_EVENT = "quickhub:navigate";

export const isQuickHubSpaNavigationEnabled = (): boolean => {
	const currentWindow = getBrowserWindow();
	if (currentWindow === null) {
		return false;
	}
	return Reflect.get(currentWindow, "__quickhubSpa") === true;
};

export const notifyQuickHubNavigation = () => {
	const currentWindow = getBrowserWindow();
	if (currentWindow === null) {
		return;
	}

	currentWindow.dispatchEvent(new Event("quickhub:navigation"));
};

export const navigateQuickHubSpa = (href: string) => {
	const currentWindow = getBrowserWindow();
	if (currentWindow === null) {
		return;
	}

	if (!href.startsWith("/")) {
		currentWindow.location.assign(href);
		return;
	}

	currentWindow.dispatchEvent(
		new CustomEvent(QUICKHUB_NAVIGATE_EVENT, {
			detail: { href },
		}),
	);
};

export const quickHubNavigateEvent = QUICKHUB_NAVIGATE_EVENT;

import { derived, writable } from "svelte/store";

type LoadingState = {
  count: number;
  message: string;
};

const initialState: LoadingState = {
  count: 0,
  message: "Loading...",
};

const loadingState = writable<LoadingState>(initialState);

export const isGlobalLoading = derived(loadingState, ($state) => $state.count > 0);
export const globalLoadingMessage = derived(
  loadingState,
  ($state) => $state.message,
);

export function startGlobalLoading(message = "Loading...") {
  loadingState.update((state) => ({
    count: state.count + 1,
    message,
  }));
}

export function stopGlobalLoading() {
  loadingState.update((state) => ({
    count: Math.max(0, state.count - 1),
    message: state.message,
  }));
}

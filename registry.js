// Event registries (delegated in main.js): click actions, input handlers, change handlers.
export const acts = {};
export const ins = {};
export const chs = {};
/** Hooks that main.js fills in (avoid circular imports). */
export const hooks = { refresh: () => {}, applyTheme: () => {}, maybeLock: () => {}, setLang: () => {} };

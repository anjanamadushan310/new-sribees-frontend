import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { act, cleanup, configure } from '@testing-library/react';

// Ant Design table/form updates can exceed 1s under CI coverage.
configure({ asyncUtilTimeout: 5000 });

// jsdom has no matchMedia; Ant Design's responsive grid and tables need one.
if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: (query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
        }),
    });
}

// jsdom throws "Not implemented: window.getComputedStyle(elt, pseudoElt)" when pseudoElt is passed.
// Ant Design tables and scrollbar measurement call getComputedStyle(elt, '::-webkit-scrollbar').
if (typeof window !== 'undefined' && window.getComputedStyle) {
    const originalGetComputedStyle = window.getComputedStyle;
    window.getComputedStyle = function (elt: Element, _pseudoElt?: string | null) {
        return originalGetComputedStyle.call(this, elt);
    };
}


// Nor ResizeObserver, which Ant Design's tables, modals and overflow menus use.
if (!('ResizeObserver' in window)) {
    class ResizeObserverStub {
        observe() {}
        unobserve() {}
        disconnect() {}
    }
    Object.defineProperty(window, 'ResizeObserver', { writable: true, value: ResizeObserverStub });
    Object.defineProperty(globalThis, 'ResizeObserver', { writable: true, value: ResizeObserverStub });
}

afterEach(async () => {
    // Drain React's queued unmount work before jsdom destroys its window.
    // Otherwise late Ant Design/query updates can escape into the next file.
    await act(async () => {
        cleanup();
        localStorage.clear();
    });
});

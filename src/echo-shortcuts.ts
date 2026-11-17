/*
Copyright 2026 Echo.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

/*
 * Echo app-wide keyboard shortcuts, handled in the main process via
 * before-input-event so the webapp never sees the keys (and cannot override
 * or be affected by them):
 *
 *   Ctrl+Shift+B - hide/show the app window, registered OS-wide so the same
 *                  key brings it back while hidden (the app stays in the tray)
 *   Ctrl+T      - application opacity down 10% per press (floor: 0%, fully
 *                  invisible — note the invisible window still catches clicks;
 *                  Ctrl+U raises it back)
 *   Ctrl+U      - application opacity up 10% per press
 *   Ctrl+Alt+M  - toggle click-through ghost mode: mouse clicks pass through
 *                  the window and keyboard focus is dropped, so every other
 *                  Echo shortcut goes inert. OS-wide, so Ctrl+Alt+M is always
 *                  the way back. (The window floats always-on-top regardless —
 *                  that is permanent, not part of this mode.)
 *   Ctrl+Arrows - move the window (holding auto-repeats like typing: the
 *                  window keeps stepping while held and stops where released)
 *   Ctrl+Q      - quit the app entirely (bypasses the tray; the standard
 *                  confirm dialog still appears)
 *
 * Opacity is applied to the whole window with BrowserWindow.setOpacity, so
 * every part of the app (messages, images, chrome) fades together as one
 * surface — not per container. It is session-only: the window always starts
 * fully opaque. Steps apply on discrete presses only (holding the key does
 * not auto-repeat the step).
 */

import { app, BrowserWindow, globalShortcut, type Input } from "electron";

const OPACITY_STEP = 0.1;
const MIN_OPACITY = 0;
const MOVE_STEP = 20; // px per auto-repeat tick while Ctrl+Arrow is held

// Echo's resting state (operator preference): launches as a 40% ghost
// overlay — click-through — until Ctrl+Alt+M makes it interactive. The
// window floats ALWAYS-ON-TOP permanently, independent of ghost mode.
// Ctrl+T/Ctrl+U adjust the opacity per press.
const DEFAULT_OPACITY = 0.4;
let opacity = DEFAULT_OPACITY;
let clickThrough = true;

function isEchoShortcut(
    input: Input,
    key: string,
    opts: { shift?: boolean; alt?: boolean } = {},
): boolean {
    return (
        input.type === "keyDown" &&
        !input.isAutoRepeat &&
        input.control &&
        input.shift === (opts.shift ?? false) &&
        input.alt === (opts.alt ?? false) &&
        !input.meta &&
        input.key.toLowerCase() === key
    );
}

/**
 * Ctrl+Arrow detection. Auto-repeat events are deliberately wanted here:
 * holding the key floods before-input-event with repeats and each one moves
 * the window a step, so a long press drags and release stops it in place.
 * Ctrl+Shift+Arrow (word selection) is left alone for the webapp.
 */
function ctrlArrow(input: Input): string | null {
    if (input.type !== "keyDown" || !input.control || input.alt || input.meta || input.shift) {
        return null;
    }
    return ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(input.key) ? input.key : null;
}

function moveWindowBy(win: BrowserWindow, key: string): void {
    const [x, y] = win.getPosition();
    const dx = key === "ArrowLeft" ? -MOVE_STEP : key === "ArrowRight" ? MOVE_STEP : 0;
    const dy = key === "ArrowUp" ? -MOVE_STEP : key === "ArrowDown" ? MOVE_STEP : 0;
    win.setPosition(x + dx, y + dy);
}

/** Transient HUD pill at the top of the page confirming the current level. */
function showHud(win: BrowserWindow, message: string): void {
    if (win.isDestroyed()) return;
    void win.webContents
        .executeJavaScript(
            `(() => {
                const id = "echo-hud";
                let el = document.getElementById(id);
                if (!el) {
                    el = document.createElement("div");
                    el.id = id;
                    document.documentElement.appendChild(el);
                }
                el.textContent = ${JSON.stringify(message)};
                el.style.cssText =
                    "position:fixed;top:14px;left:50%;transform:translateX(-50%);" +
                    "z-index:2147483647;background:rgba(7,26,110,.85);color:#fff;" +
                    "padding:6px 14px;border-radius:999px;font:600 13px system-ui,sans-serif;" +
                    "pointer-events:none;opacity:.95;transition:opacity .35s;";
                if (el._echoTimeout) clearTimeout(el._echoTimeout);
                el._echoTimeout = setTimeout(() => {
                    el.style.opacity = "0";
                    setTimeout(() => el.remove(), 400);
                }, 1100);
            })()`,
        )
        .catch(() => {
            // The page may be navigating; the HUD is cosmetic, ignore failures.
        });
}

function toggleWindow(win: BrowserWindow): void {
    // Bring the window back as a standard windowed app, never maximized.
    // The unmaximize must happen AFTER show(): on a hidden window the call is
    // a no-op, and the maximized state can also settle asynchronously, so it
    // is re-checked on the next tick.
    const keepWindowed = (w: BrowserWindow): void => {
        if (w.isMaximized()) w.unmaximize();
        setTimeout(() => {
            if (!w.isDestroyed() && w.isMaximized()) w.unmaximize();
        }, 200);
    };
    if (win.isMinimized()) {
        win.restore();
        win.show();
        win.focus();
        keepWindowed(win);
        console.log("Echo window: restored");
    } else if (win.isVisible()) {
        win.hide();
        console.log("Echo window: hidden (Ctrl+Shift+B restores it)");
    } else {
        win.show();
        win.focus();
        keepWindowed(win);
        console.log("Echo window: shown");
    }
}

function toggleClickThrough(win: BrowserWindow): void {
    clickThrough = !clickThrough;
    // Always-on-top is permanent and deliberately untouched here.
    win.setIgnoreMouseEvents(clickThrough);
    if (clickThrough) {
        // Fully inert ghost: mouse already passes through — drop keyboard focus
        // too, so typing/keys don't leak into the app while it is a ghost.
        win.blur();
    } else {
        // Leaving ghost mode: the in-app shortcuts (Ctrl+T/U) need the window
        // focused, so bring it back to the front.
        win.show();
        win.focus();
    }
    console.log(`Echo click-through: ${clickThrough ? "ON" : "OFF"}`);
    showHud(win, clickThrough ? "Click-through ON — Ctrl+Alt+M to undo" : "Click-through OFF");
}

function stepOpacity(win: BrowserWindow, delta: number): void {
    opacity = Math.min(1, Math.max(MIN_OPACITY, opacity + delta));
    win.setOpacity(opacity);
    console.log(`Echo opacity: ${Math.round(opacity * 100)}%`);
    const atLimit = (delta < 0 && opacity === MIN_OPACITY) || (delta > 0 && opacity === 1);
    showHud(win, `Opacity ${Math.round(opacity * 100)}%${atLimit ? " (limit)" : ""}`);
}

/**
 * Installs the Echo app-wide shortcuts on the main window's webContents.
 * Matching keys are consumed in the main process (event.preventDefault) so
 * they never reach the webapp.
 */
export function installEchoShortcuts(win: BrowserWindow): void {
    // Launch defaults (operator preference): start as a 40% ghost —
    // click-through and keyboard-inert until Ctrl+Alt+M. The window also
    // floats always-on-top permanently (independent of this mode).
    win.setOpacity(opacity);
    win.setIgnoreMouseEvents(true);
    win.setAlwaysOnTop(true);
    // show() at ready-to-show would focus the window; drop focus right after.
    win.once("show", () => {
        if (!win.isDestroyed()) win.blur();
    });
    console.log("Echo launch: ghost ON at 40% opacity (Ctrl+Alt+M to interact)");

    // Ctrl+Shift+B must work while the window is hidden — but the in-app
    // before-input-event hook only sees keys when the window is focused. So the
    // hide/show toggle is registered OS-wide; if another app already owns the
    // combo, fall back to in-app handling (hide/show only while focused).
    const hideShortcutGlobal = globalShortcut.register("Control+Shift+B", () => {
        if (clickThrough) return; // app shortcuts are disabled in click-through mode
        toggleWindow(win);
    });
    if (!hideShortcutGlobal) {
        console.warn(
            "Global Ctrl+Shift+B shortcut unavailable (taken by another app); hide/show works only while the window is focused",
        );
    }

    // Click-through must be undoable while the window is unclickable and
    // possibly unfocused, so this toggle is also registered OS-wide.
    const clickThroughGlobal = globalShortcut.register("Control+Alt+M", () => toggleClickThrough(win));
    if (!clickThroughGlobal) {
        console.warn(
            "Global Ctrl+Alt+M shortcut unavailable (taken by another app); click-through toggle works only while the window is focused",
        );
    }

    app.once("will-quit", () => {
        globalShortcut.unregister("Control+Shift+B");
        globalShortcut.unregister("Control+Alt+M");
    });

    win.webContents.on("before-input-event", (event, input) => {
        let handled = false;
        if (clickThrough) {
            // Ghost mode: every Echo shortcut is inert except the escape toggle
            // (Ctrl+Alt+M, handled OS-wide; the branch below is only the
            // fallback for when its global registration was unavailable).
        } else if (!hideShortcutGlobal && isEchoShortcut(input, "b", { shift: true })) {
            toggleWindow(win);
            handled = true;
        } else if (isEchoShortcut(input, "t")) {
            stepOpacity(win, -OPACITY_STEP);
            handled = true;
        } else if (isEchoShortcut(input, "u")) {
            stepOpacity(win, +OPACITY_STEP);
            handled = true;
        } else if (isEchoShortcut(input, "q")) {
            console.log("Echo quit: Ctrl+Q");
            // Mark as an intentional quit so the close handler exits instead
            // of minimising to the tray.
            (global as Record<string, unknown>).appQuitting = true;
            app.quit();
            handled = true;
        } else if (!clickThroughGlobal && isEchoShortcut(input, "m", { alt: true })) {
            toggleClickThrough(win);
            handled = true;
        } else {
            const arrow = ctrlArrow(input);
            if (arrow) {
                if (win.isMaximized()) win.unmaximize();
                moveWindowBy(win, arrow);
                if (!input.isAutoRepeat) {
                    console.log(`Echo window: moving with Ctrl+${arrow} (hold to keep moving)`);
                }
                handled = true;
            }
        }
        if (handled) event.preventDefault();
    });

    // The webapp reloads itself on logout/clear-data: re-assert the ghost state.
    win.webContents.on("did-finish-load", () => {
        if (win.isDestroyed()) return;
        win.setOpacity(opacity);
        // Always-on-top is permanent, ghost mode or not.
        win.setAlwaysOnTop(true);
        if (clickThrough) win.setIgnoreMouseEvents(true);
    });
}

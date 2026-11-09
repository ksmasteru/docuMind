// Keeps the field being typed in visible above a phone's on-screen keyboard, on every page.
//
// Why the browser's own scroll isn't enough here: the task screen is a full-height frame (100dvh) whose
// content scrolls inside it, and iOS doesn't shrink that frame when the keyboard opens: it only
// shrinks the *visual* viewport. The browser scrolls the window, not the inner scroller, so a field low
// on the page ends up under the keyboard. And after Entrée (a reading or a choice added, a line added)
// the page moves and nothing scrolls it back.
//
// So: when a field gets the focus, when the keyboard opens or closes (visualViewport resize), when Entrée
// is pressed and when a text grows, the focused field is scrolled — in its scrolling container first,
// then the window — until it sits inside the visible part of the screen, with a margin.
// While the keyboard is open <html> has the class "keyboard-open" and --keyboard-inset (its height),
// so scrolling areas can make room at their end (index.css) and the phone's bottom tab bar can step aside.

const MARGIN = 24; // px between the field and the keyboard (or the top of the screen)
const KEYBOARD_MIN = 120; // a visual viewport this much shorter than the window: the keyboard is open

export const isTypingField = (el) =>
    !!el && (el.tagName === "TEXTAREA" || el.isContentEditable
        || (el.tagName === "INPUT" && !["button", "checkbox", "radio", "file", "range", "submit", "reset", "image", "color"].includes(el.type)));

const scrollableParent = (el) => {
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        const { overflowY } = getComputedStyle(node);
        if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
    }
    return null;
};

// the part of the screen not covered by the keyboard, in the same coordinates as getBoundingClientRect
const visibleArea = () => {
    const vv = window.visualViewport;
    return vv ? { top: vv.offsetTop, bottom: vv.offsetTop + vv.height } : { top: 0, bottom: window.innerHeight };
};

// how far the field must move up (> 0) or down (< 0) to be in view; 0 when it already is
const overflowOf = (el) => {
    const rect = el.getBoundingClientRect();
    const { top, bottom } = visibleArea();
    const room = bottom - top - 2 * MARGIN;
    // a field taller than the room (a long text): its top, where the typing usually starts, stays in view
    if (rect.height > room) return rect.top - (top + MARGIN);
    if (rect.bottom > bottom - MARGIN) return rect.bottom - (bottom - MARGIN);
    if (rect.top < top + MARGIN) return rect.top - (top + MARGIN);
    return 0;
};

export const revealField = (el) => {
    if (!isTypingField(el) || !el.isConnected) return;
    let delta = overflowOf(el);
    if (Math.abs(delta) < 1) return;
    // the scrolling containers first, innermost out, then the window
    for (let box = scrollableParent(el); box && Math.abs(delta) >= 1; box = scrollableParent(box)) {
        const before = box.scrollTop;
        box.scrollTop = before + delta;
        delta -= box.scrollTop - before;
    }
    if (Math.abs(delta) >= 1) window.scrollBy(0, delta);
};

let installed = false;

export function keepFocusedFieldVisible() {
    if (installed || typeof window === "undefined") return;
    installed = true;

    let timer = null;
    // after the keyboard's animation and React's re-render: measure once the page has settled
    const reveal = (delay = 0) => {
        clearTimeout(timer);
        timer = setTimeout(() => requestAnimationFrame(() => revealField(document.activeElement)), delay);
    };

    const keyboard = () => {
        const vv = window.visualViewport;
        const inset = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
        const open = inset > KEYBOARD_MIN && isTypingField(document.activeElement);
        document.documentElement.classList.toggle("keyboard-open", open);
        document.documentElement.style.setProperty("--keyboard-inset", `${open ? inset : 0}px`);
    };

    document.addEventListener("focusin", (e) => { if (isTypingField(e.target)) { keyboard(); reveal(350); } });
    document.addEventListener("focusout", () => setTimeout(keyboard, 100));
    // Entrée adds a line, a reading, a choice: the page moves under the field
    document.addEventListener("keydown", (e) => { if (e.key === "Enter" && isTypingField(e.target)) reveal(60); });
    document.addEventListener("input", (e) => { if (e.target.tagName === "TEXTAREA") reveal(0); });
    window.visualViewport?.addEventListener("resize", () => { keyboard(); reveal(50); });
    window.addEventListener("resize", () => { keyboard(); reveal(50); });
}

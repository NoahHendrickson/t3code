import { DUR_FAST_MS, EASE_OUT, prefersReducedMotion } from "./vendor/motion";

const CSS = `
[hidden] { display: none !important; }
*, *::before, *::after { box-sizing: border-box; }
:host { all: initial; --accent: #0d99ff; --accent-outline: rgba(13, 153, 255, 0.75); }
#outline, #select-outline, .select-outline-multi, .ripple-outline {
  position: fixed; pointer-events: none; border-radius: 2px;
}
#outline {
  z-index: 2147483645; border: 1.5px solid var(--accent-outline);
}
#select-outline, .select-outline-multi {
  z-index: 2147483646; border: 2px solid var(--accent);
}
#select-outline {
  transition: opacity 80ms ${EASE_OUT};
}
#select-outline.tween {
  transition: left ${DUR_FAST_MS}ms ${EASE_OUT}, top ${DUR_FAST_MS}ms ${EASE_OUT},
    width ${DUR_FAST_MS}ms ${EASE_OUT}, height ${DUR_FAST_MS}ms ${EASE_OUT};
}
@starting-style { #select-outline { opacity: 0; } }
.ripple-outline {
  z-index: 2147483644; border: 1.5px dashed #e2954a;
  opacity: 1; transition: opacity 0.3s ease-out;
}
.insert-indicator {
  position: fixed; z-index: 2147483646; pointer-events: none;
}
.insert-indicator::before {
  content: ''; position: absolute; background: var(--accent); border-radius: 2px;
}
.insert-indicator[data-axis="row"]::before {
  left: 50%; top: 0; bottom: 0; width: 2px; transform: translateX(-1px);
}
.insert-indicator[data-axis="column"]::before {
  top: 50%; left: 0; right: 0; height: 2px; transform: translateY(-1px);
}
.resize-handles {
  position: fixed; z-index: 2147483646; pointer-events: none;
}
.resize-handle {
  position: absolute; width: 8px; height: 8px;
  background: #2c2c2c; border: 1.5px solid var(--accent); border-radius: 2px;
}
.resize-handle[data-handle="n"]  { top: -4px; left: 50%; margin-left: -4px; cursor: ns-resize; }
.resize-handle[data-handle="s"]  { bottom: -4px; left: 50%; margin-left: -4px; cursor: ns-resize; }
.resize-handle[data-handle="e"]  { right: -4px; top: 50%; margin-top: -4px; cursor: ew-resize; }
.resize-handle[data-handle="w"]  { left: -4px; top: 50%; margin-top: -4px; cursor: ew-resize; }
.resize-handle[data-handle="ne"] { top: -4px; right: -4px; cursor: nesw-resize; }
.resize-handle[data-handle="sw"] { bottom: -4px; left: -4px; cursor: nesw-resize; }
.resize-handle[data-handle="nw"] { top: -4px; left: -4px; cursor: nwse-resize; }
.resize-handle[data-handle="se"] { bottom: -4px; right: -4px; cursor: nwse-resize; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 1ms !important; }
}
`;

/** The guest-side chrome that remains after moving the properties UI into T3 React. */
export class HeadlessOverlay {
  readonly host = document.createElement("div");

  private readonly outline = document.createElement("div");
  private readonly selectOutline = document.createElement("div");
  private readonly selectOutlinePool: HTMLElement[] = [];
  private readonly ripplePool: HTMLElement[] = [];
  private rippleClearTimer: ReturnType<typeof setTimeout> | null = null;
  private rippleFadeTimer: ReturnType<typeof setTimeout> | null = null;
  private outlineTweenTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const root = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    this.outline.id = "outline";
    this.selectOutline.id = "select-outline";
    this.outline.hidden = true;
    this.selectOutline.hidden = true;
    root.append(style, this.outline, this.selectOutline);
  }

  mount(): void {
    document.documentElement.appendChild(this.host);
  }

  attach(element: HTMLElement): void {
    this.host.shadowRoot?.appendChild(element);
  }

  contains(target: EventTarget | null): boolean {
    return target instanceof Node && this.host.contains(target);
  }

  containsDeep(target: EventTarget | null): boolean {
    return (
      this.contains(target) ||
      (target instanceof Node && this.host.shadowRoot?.contains(target) === true)
    );
  }

  setActive(on: boolean): void {
    if (on) return;
    this.hideOutline();
    this.hideSelectOutline();
    this.hideSelectOutlines();
    this.clearRipples();
  }

  private place(element: HTMLElement, rect: DOMRect): void {
    element.hidden = false;
    element.style.left = `${rect.left - 2}px`;
    element.style.top = `${rect.top - 2}px`;
    element.style.width = `${rect.width + 4}px`;
    element.style.height = `${rect.height + 4}px`;
  }

  showOutline(rect: DOMRect): void {
    this.place(this.outline, rect);
  }

  hideOutline(): void {
    this.outline.hidden = true;
  }

  showSelectOutline(rect: DOMRect, tween = false): void {
    if (this.outlineTweenTimer) clearTimeout(this.outlineTweenTimer);
    this.outlineTweenTimer = null;
    if (tween && !this.selectOutline.hidden && !prefersReducedMotion()) {
      this.selectOutline.classList.add("tween");
      this.outlineTweenTimer = setTimeout(() => {
        this.outlineTweenTimer = null;
        this.selectOutline.classList.remove("tween");
      }, DUR_FAST_MS + 50);
    } else {
      this.selectOutline.classList.remove("tween");
    }
    this.place(this.selectOutline, rect);
  }

  hideSelectOutline(): void {
    this.selectOutline.hidden = true;
  }

  showSelectOutlines(rects: DOMRect[]): void {
    while (this.selectOutlinePool.length < rects.length) {
      const outline = document.createElement("div");
      outline.className = "select-outline-multi";
      outline.hidden = true;
      this.host.shadowRoot?.appendChild(outline);
      this.selectOutlinePool.push(outline);
    }
    this.selectOutlinePool.forEach((outline, index) => {
      if (index < rects.length) this.place(outline, rects[index]);
      else outline.hidden = true;
    });
  }

  hideSelectOutlines(): void {
    for (const outline of this.selectOutlinePool) outline.hidden = true;
  }

  showRipples(rects: DOMRect[]): void {
    const shown = rects.slice(0, 8);
    while (this.ripplePool.length < shown.length) {
      const ripple = document.createElement("div");
      ripple.className = "ripple-outline";
      ripple.hidden = true;
      this.host.shadowRoot?.appendChild(ripple);
      this.ripplePool.push(ripple);
    }
    this.ripplePool.forEach((ripple, index) => {
      if (index < shown.length) {
        this.place(ripple, shown[index]);
        ripple.style.opacity = "1";
      } else {
        ripple.hidden = true;
      }
    });
    if (this.rippleClearTimer) clearTimeout(this.rippleClearTimer);
    if (this.rippleFadeTimer) clearTimeout(this.rippleFadeTimer);
    this.rippleFadeTimer = null;
    this.rippleClearTimer = setTimeout(() => {
      this.rippleClearTimer = null;
      this.clearRipples();
    }, 1_500);
  }

  destroy(): void {
    if (this.outlineTweenTimer) clearTimeout(this.outlineTweenTimer);
    if (this.rippleClearTimer) clearTimeout(this.rippleClearTimer);
    if (this.rippleFadeTimer) clearTimeout(this.rippleFadeTimer);
    this.host.remove();
  }

  private clearRipples(): void {
    if (this.rippleClearTimer) clearTimeout(this.rippleClearTimer);
    this.rippleClearTimer = null;
    if (this.rippleFadeTimer) clearTimeout(this.rippleFadeTimer);
    for (const ripple of this.ripplePool) ripple.style.opacity = "0";
    this.rippleFadeTimer = setTimeout(() => {
      this.rippleFadeTimer = null;
      for (const ripple of this.ripplePool) ripple.hidden = true;
    }, 300);
  }
}

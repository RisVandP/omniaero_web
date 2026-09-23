(function () {
    const pages = [
        { id: "home", href: "index.html" },
        { id: "uav", href: "user.html" },
        { id: "gis", href: "map.html" },
        { id: "jobs", href: "datacenter.html" },
        { id: "model", href: "model.html" },
        { id: "settings", href: "settings.html" }
    ];
    const pageByHref = new Map(pages.map(page => [page.href, page]));
    const pageById = new Map(pages.map(page => [page.id, page]));
    const isChildFrame = window.top !== window;

    function basename(url) {
        try {
            const parsed = new URL(url, window.location.href);
            return parsed.pathname.split("/").pop() || "index.html";
        } catch (error) {
            return String(url || "").split("?")[0].split("#")[0].split("/").pop() || "index.html";
        }
    }

    function normalizeHref(href) {
        const name = basename(href);
        return pageByHref.has(name) ? name : null;
    }

    function injectStyle(css) {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);
    }

    function setupChildFrame() {
        document.documentElement.classList.add("omni-spa-child");
        document.body.classList.add("omni-spa-child");
        injectStyle(`
            html.omni-spa-child,
            body.omni-spa-child {
                width: 100%;
                height: 100%;
                min-height: 100%;
                overflow: hidden !important;
            }
            body.omni-spa-child > .vehicle-header,
            body.omni-spa-child > .navbar {
                display: none !important;
            }
            body.omni-spa-child .main-content,
            body.omni-spa-child .vehicle-home-minimal {
                height: 100vh !important;
            }
            body.omni-spa-child[data-page="gis"] #map {
                position: fixed !important;
                inset: 0 !important;
                width: 100% !important;
                height: 100% !important;
            }
            body.omni-spa-child[data-page="gis"] .gemini-dock {
                bottom: 24px !important;
            }
            body.omni-spa-child[data-page="gis"] .map-audit-watermark {
                bottom: 8px !important;
            }
            @media (max-width: 820px) {
                html.omni-spa-child,
                body.omni-spa-child {
                    height: auto;
                    min-height: 100%;
                    overflow-x: hidden !important;
                    overflow-y: auto !important;
                }
                body.omni-spa-child:not([data-page="gis"]) .main-content,
                body.omni-spa-child:not([data-page="gis"]) .vehicle-home-minimal {
                    height: auto !important;
                    min-height: 100dvh !important;
                }
                body.omni-spa-child[data-page="gis"] {
                    height: 100%;
                    overflow: hidden !important;
                }
                body.omni-spa-child[data-page="gis"] #map {
                    height: 100% !important;
                }
            }
        `);

        document.addEventListener("click", event => {
            const link = event.target.closest("a[href]");
            if (!link) return;
            const href = normalizeHref(link.getAttribute("href"));
            if (!href) return;
            event.preventDefault();
            window.parent.postMessage({ type: "omni-spa:navigate", href }, window.location.origin);
        });
    }

    if (isChildFrame) {
        setupChildFrame();
        return;
    }

    const initialHref = normalizeHref(window.location.href);
    if (!initialHref || window.__omniSpaReady) return;

    if (window.matchMedia("(max-width: 820px)").matches) {
        document.documentElement.classList.add("omni-mobile-direct");
        document.body.classList.add("omni-mobile-direct");
        return;
    }

    window.__omniSpaReady = true;

    const frames = new Map();

    injectStyle(`
        body.omni-spa-shell {
            overflow: hidden !important;
        }
        body.omni-spa-shell > :not(.vehicle-header):not(.omni-spa-frames):not(script):not(style) {
            display: none !important;
        }
        .omni-spa-frames {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            top: clamp(74px, 8.3vh, 92px);
            z-index: 2;
            background: #030a16;
            overflow: hidden;
        }
        .omni-spa-frame {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            border: 0;
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transition: opacity 0.18s ease;
            background: #030a16;
        }
        .omni-spa-frame.active {
            opacity: 1;
            visibility: visible;
            pointer-events: auto;
        }
    `);

    const container = document.createElement("div");
    container.className = "omni-spa-frames";
    document.body.appendChild(container);
    document.body.classList.add("omni-spa-shell");

    function syncFrameTop() {
        const header = document.querySelector(".vehicle-header, .navbar");
        if (!header) return;
        container.style.top = `${Math.ceil(header.getBoundingClientRect().height)}px`;
    }

    window.addEventListener("resize", syncFrameTop);
    if (window.ResizeObserver) {
        const header = document.querySelector(".vehicle-header, .navbar");
        if (header) new ResizeObserver(syncFrameTop).observe(header);
    }
    requestAnimationFrame(syncFrameTop);

    function frameSrc(href) {
        return `${href}?spa=1`;
    }

    function ensureFrame(page) {
        let frame = frames.get(page.id);
        if (frame) return frame;
        frame = document.createElement("iframe");
        frame.className = "omni-spa-frame";
        frame.dataset.page = page.id;
        frame.title = page.id;
        frame.src = frameSrc(page.href);
        container.appendChild(frame);
        frames.set(page.id, frame);
        return frame;
    }

    function setActiveNav(pageId) {
        document.body.dataset.page = pageId;
        document.querySelectorAll(".module-btn[data-page]").forEach(button => {
            button.classList.toggle("active", button.dataset.page === pageId);
        });
    }

    function navigate(href, options = {}) {
        const normalized = normalizeHref(href);
        if (!normalized) {
            window.location.href = href;
            return;
        }

        const page = pageByHref.get(normalized);
        const frame = ensureFrame(page);
        frames.forEach(candidate => candidate.classList.remove("active"));
        frame.classList.add("active");
        setActiveNav(page.id);
        syncFrameTop();
        requestAnimationFrame(syncFrameTop);
        window.setTimeout(syncFrameTop, 120);

        if (options.push !== false && basename(window.location.href) !== normalized) {
            history.pushState({ omniSpaPage: page.id }, "", normalized);
        }
    }

    window.OmniSpaNavigate = navigate;

    window.addEventListener("message", event => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === "omni-spa:navigate") {
            navigate(event.data.href);
            const normalized = normalizeHref(event.data.href);
            const page = normalized ? pageByHref.get(normalized) : null;
            const frame = page ? frames.get(page.id) : null;
            window.setTimeout(() => {
                frame?.contentWindow?.postMessage({ type: "omni-agent:resume" }, window.location.origin);
            }, 120);
            return;
        }
        if (event.data?.type === "omni-agent:resume") {
            const activeFrame = document.querySelector(".omni-spa-frame.active");
            activeFrame?.contentWindow?.postMessage({ type: "omni-agent:resume" }, window.location.origin);
        }
    });

    document.addEventListener("click", event => {
        const node = event.target.closest("[data-spa-href], a[href]");
        if (!node) return;
        const rawHref = node.dataset.spaHref || node.getAttribute("href");
        const href = normalizeHref(rawHref);
        if (!href) return;
        event.preventDefault();
        navigate(href);
    }, true);

    window.addEventListener("popstate", () => {
        const href = normalizeHref(window.location.href) || initialHref;
        navigate(href, { push: false });
    });

    navigate(initialHref, { push: false });
    window.setTimeout(() => {
        pages.forEach(page => {
            if (!frames.has(page.id)) ensureFrame(page);
        });
    }, 450);
})();

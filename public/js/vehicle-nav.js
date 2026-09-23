(function () {
    const page = document.body.dataset.page || "home";
    const navItems = [
        ["home", "index.html", "系统首页", "Home"],
        ["uav", "user.html", "无人机管理", "UAV Fleet"],
        ["gis", "map.html", "GIS智慧调度", "GIS Dispatch"],
        ["jobs", "datacenter.html", "作业管理", "Operation"],
        ["model", "model.html", "模型联动管理", "Model Linkage"]
    ];

    const header = document.querySelector(".navbar, .vehicle-header");
    if (!header) return;

    const navigate = href => {
        if (window.top !== window && window.parent) {
            window.parent.postMessage({ type: "omni-spa:navigate", href }, window.location.origin);
            return;
        }
        if (typeof window.OmniSpaNavigate === "function") {
            window.OmniSpaNavigate(href);
            return;
        }
        window.location.href = href;
    };

    window.OmniVehicleNavigate = navigate;

    const buttonHtml = ([id, href, label, sub]) => `
        <button class="module-btn ${page === id ? "active" : ""}" data-page="${id}" data-spa-href="${href}" type="button">
            <i class="nav-icon"></i>
            <span class="nav-text"><span>${label}</span><small>${sub}</small></span>
        </button>`;

    header.className = "vehicle-header";
    header.innerHTML = `
        <nav class="module-nav module-nav-left" aria-label="左侧业务模块">
            ${navItems.slice(0, 3).map(buttonHtml).join("")}
        </nav>
        <div class="header-brand" data-spa-href="index.html" role="button" tabindex="0">
            <div class="brand-title">OmniAero-Vision<span>智能巡检系统</span></div>
            <div class="brand-sub">MULTIMODAL UAV INSPECTION AND GIS DISPATCH PLATFORM</div>
        </div>
        <nav class="module-nav module-nav-right" aria-label="右侧业务模块">
            ${navItems.slice(3).map(buttonHtml).join("")}
            <button class="module-btn account-btn ${page === "settings" ? "active" : ""}" type="button" data-spa-href="settings.html">
                <i class="nav-icon"></i>
                <span class="nav-text"><span>设置</span><small>Settings</small></span>
            </button>
        </nav>`;

    header.querySelectorAll("[data-spa-href]").forEach(node => {
        node.addEventListener("click", () => navigate(node.dataset.spaHref));
        node.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                navigate(node.dataset.spaHref);
            }
        });
    });
})();

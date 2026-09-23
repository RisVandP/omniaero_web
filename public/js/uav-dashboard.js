(function () {
    const DRONES = [
        { id: "drone_01", title: "天眼一号", loc: "K123+760", status: "巡检中", battery: 78, speed: "42km/h", link: "N78 18ms", task: "桥隧低空复核", x: 46, y: 32 },
        { id: "drone_02", title: "天眼二号", loc: "K121+400", status: "待命", battery: 92, speed: "0km/h", link: "N76 24ms", task: "站点空域待命", x: 27, y: 60 },
        { id: "drone_03", title: "巡检无人机-07", loc: "K124+180", status: "执行中", battery: 82, speed: "35km/h", link: "N78 21ms", task: "异物事件复核", x: 65, y: 45 },
        { id: "drone_04", title: "运输无人机", loc: "空地驿站01", status: "载荷待命", battery: 88, speed: "0km/h", link: "N75 26ms", task: "机器人投送", x: 22, y: 73 }
    ];

    const logs = [
        ["green", "13:09:12", "状态心跳正常"],
        ["cyan", "13:08:40", "位置更新完成"],
        ["red", "13:07:28", "任务载荷参数同步完成"]
    ];

    const modeText = () => localStorage.getItem("omni_video_mode") || "RGB";
    const isSemiOn = () => localStorage.getItem("omni_semi_enabled") === "true";

    function getDroneName(id) {
        const item = document.querySelector(`.drone-item[data-id="${id}"]`);
        return item?.dataset.name || DRONES.find(drone => drone.id === id)?.title || id;
    }

    function getDroneMeta(id) {
        const item = document.querySelector(`.drone-item[data-id="${id}"]`);
        const base = DRONES.find(drone => drone.id === id) || DRONES[0];
        const statusText = item?.querySelector(".drone-status")?.textContent || "";
        const isOffline = item?.querySelector(".status-dot")?.classList.contains("offline") ?? true;
        return {
            ...base,
            name: getDroneName(id),
            isOffline,
            statusText,
            task: item?.dataset.task || base.task
        };
    }

    function getLoadedPath(id) {
        if (id === "drone_01") {
            return isSemiOn() ? "Video/无人机01号/test1.png" : "Video/无人机01号/test.png";
        }
        if (typeof getVideoPath === "function") {
            return getVideoPath(id, modeText()) || "未配置视频源";
        }
        return "未配置视频源";
    }

    function mediaHtml(drone) {
        const path = getLoadedPath(drone.id);
        const offline = getDroneMeta(drone.id).isOffline;
        if (offline || !path || path === "未配置视频源") {
            return `<div class="uav-camera-tile monitor-feed offline" data-preview-id="${drone.id}">
                <div class="uav-camera-label">${drone.title}</div>
                <span>等待连接画面</span>
                <div class="uav-camera-path">载入路径：${path}</div>
            </div>`;
        }
        const tag = /\.(png|jpg|jpeg|webp)$/i.test(path)
            ? `<img src="${path}" alt="${drone.title} 预览">`
            : `<video src="${path}" muted autoplay loop playsinline></video>`;
        return `<div class="uav-camera-tile monitor-feed" data-preview-id="${drone.id}">
            ${tag}
            <div class="uav-camera-label">${drone.title}</div>
            <div class="uav-camera-actions"><span>Auto</span><span>接管</span></div>
            <div class="uav-rec">REC</div>
            <div class="uav-quality">1080P</div>
            <div class="uav-camera-path">载入路径：${path}</div>
        </div>`;
    }

    function buildOverview() {
        const total = DRONES.length;
        const online = DRONES.filter(drone => !getDroneMeta(drone.id).isOffline).length;
        const working = DRONES.filter(drone => {
            const meta = getDroneMeta(drone.id);
            return !meta.isOffline && /巡检|执行|侦察/.test(meta.statusText + meta.status + meta.task);
        }).length;
        const warning = DRONES.filter(drone => /告警|异常|复核/.test(getDroneMeta(drone.id).task)).length;
        const avgBattery = Math.round(DRONES.reduce((sum, drone) => sum + getDroneMeta(drone.id).battery, 0) / DRONES.length);

        return `
            <div class="uav-tech-panel">
                <div class="uav-panel-title">无人机总体数据</div>
                <div class="uav-overview-main">
                    <div class="uav-stat-grid fleet-kpis">
                        <div class="uav-stat-cell"><span>工作数量</span><strong>${online || total} 架</strong></div>
                        <div class="uav-stat-cell"><span>待机数量</span><strong>${Math.max(0, total - (online || total))} 架</strong></div>
                        <div class="uav-stat-cell"><span>平均电量</span><strong>${avgBattery} %</strong></div>
                        <div class="uav-stat-cell"><span>告警设备</span><strong>${warning} 个</strong></div>
                    </div>
                    <div class="uav-topology overview-map">
                        <div class="map-district district-a">天府大道高架</div>
                        <div class="map-district district-b">应急起降点</div>
                        <div class="map-district district-c">巡检走廊</div>
                        <div class="traffic-road road-main"><span></span><span></span></div>
                        <div class="traffic-road road-cross"><span></span><span></span></div>
                        <div class="traffic-road road-branch-a"><span></span></div>
                        <div class="traffic-road road-branch-b"><span></span></div>
                        <div class="traffic-node node-a"></div>
                        <div class="traffic-node node-b"></div>
                        <div class="traffic-node node-c"></div>
                        ${Array.from({ length: 18 }, (_, index) => `<i class="traffic-car car-${index + 1}"></i>`).join("")}
                        ${DRONES.map(drone => `<button class="uav-map-point" type="button" data-open-drone="${drone.id}" style="left:${drone.x}%;top:${drone.y}%"><i></i><span>${drone.title}</span></button>`).join("")}
                        <div class="uav-map-scale"><i></i><span>500 m</span></div>
                        <div class="uav-map-compass">N</div>
                    </div>
                </div>
            </div>
            <div class="uav-tech-panel">
                <div class="uav-panel-title">无人机监控画面</div>
                <div class="uav-monitor-grid">${DRONES.map(mediaHtml).join("")}</div>
            </div>
            <div class="uav-tech-panel uav-status-table device-table">
                <div class="uav-panel-title">无人机状态列表</div>
                ${DRONES.map(drone => {
                    const meta = getDroneMeta(drone.id);
                    return `<button class="uav-status-row device-row" type="button" data-open-drone="${drone.id}">
                        <span class="dot ${meta.isOffline ? "red" : meta.status === "待命" ? "yellow" : "green"}"></span>
                        <span><strong>${drone.title}</strong><small>${meta.loc} · ${meta.task}</small></span>
                        <em>${meta.isOffline ? "离线" : `${meta.status} / ${meta.battery}%`}</em>
                    </button>`;
                }).join("")}
            </div>`;
    }

    function detailHtml(droneId) {
        const meta = getDroneMeta(droneId);
        const name = meta.title || meta.name;
        return `
            <div class="uav-tech-panel uav-live-panel">
                <div class="uav-panel-title">${name} 实时视角</div>
                <div class="uav-live-slot" id="uav-live-slot"></div>
            </div>
            <div class="uav-tech-panel uav-detail-panel">
                <div class="uav-panel-title">${name} 状态详情</div>
                <div class="uav-detail-side">
                    <div class="uav-detail-metrics">
                        <div class="uav-stat-cell"><span>当前状态</span><strong>${meta.isOffline ? "离线" : meta.status}</strong></div>
                        <div class="uav-stat-cell"><span>当前位置</span><strong>${meta.loc}</strong></div>
                        <div class="uav-stat-cell"><span>剩余电量</span><strong>${meta.battery} %</strong></div>
                        <div class="uav-stat-cell"><span>飞行速度</span><strong>${meta.speed}</strong></div>
                        <div class="uav-stat-cell"><span>通信链路</span><strong>${meta.link}</strong></div>
                        <div class="uav-stat-cell"><span>当前任务</span><strong>${meta.task}</strong></div>
                    </div>
                    <div class="uav-model-stage">
                        <div class="uav-model-fallback"></div>
                        <model-viewer src="assets/models/drone.glb" camera-controls auto-rotate rotation-per-second="35deg" exposure="1.1" shadow-intensity="0.6" camera-orbit="0deg 70deg 5m" field-of-view="34deg"></model-viewer>
                    </div>
                </div>
            </div>
            <div class="uav-tech-panel uav-log-panel">
                <div class="uav-panel-title">设备日志</div>
                <div class="uav-log-list">
                    ${logs.map(([color, time, text]) => `<div class="uav-log-row"><span class="dot ${color}"></span><time>${time}</time><span>${name}：${text}</span></div>`).join("")}
                </div>
            </div>`;
    }

    function setOverviewActive(active) {
        document.getElementById("uav-overview-entry")?.classList.toggle("active", active);
        if (active) document.querySelectorAll(".drone-item").forEach(item => item.classList.remove("active"));
    }

    function setDashboardMode(mode) {
        const section = document.querySelector(".video-section");
        if (!section) return;
        section.classList.toggle("uav-overview-mode", mode === "overview");
        section.classList.toggle("uav-detail-mode", mode === "detail");
    }

    function showOverview() {
        const dashboard = document.getElementById("uav-dashboard-view");
        const detail = document.getElementById("uav-detail-view");
        const controls = document.getElementById("video-controls-bar");
        const wrapper = document.getElementById("video-wrapper");
        if (!dashboard || !detail) return;
        dashboard.innerHTML = buildOverview();
        dashboard.classList.remove("uav-hidden");
        detail.classList.add("uav-hidden");
        if (controls) controls.style.display = "none";
        if (wrapper) wrapper.style.display = "none";
        setDashboardMode("overview");
        setOverviewActive(true);
        bindOpenTargets(dashboard);
    }

    function showDetail(droneId) {
        const dashboard = document.getElementById("uav-dashboard-view");
        const detail = document.getElementById("uav-detail-view");
        const controls = document.getElementById("video-controls-bar");
        const wrapper = document.getElementById("video-wrapper");
        if (!dashboard || !detail || !controls || !wrapper) return;

        dashboard.classList.add("uav-hidden");
        detail.classList.remove("uav-hidden");
        detail.innerHTML = detailHtml(droneId);
        document.getElementById("uav-live-slot")?.append(controls, wrapper);
        controls.style.display = "flex";
        wrapper.style.display = "flex";
        setDashboardMode("detail");
        setOverviewActive(false);
    }

    function bindOpenTargets(root = document) {
        root.querySelectorAll("[data-open-drone]").forEach(button => {
            button.addEventListener("click", () => {
                const id = button.dataset.openDrone;
                const item = document.querySelector(`.drone-item[data-id="${id}"]`);
                const isOffline = item?.querySelector(".status-dot")?.classList.contains("offline");
                if (isOffline) {
                    document.querySelectorAll(".drone-item").forEach(node => node.classList.remove("active"));
                    item?.classList.add("active");
                    localStorage.setItem("omni_current_single_drone", id);
                } else {
                    item?.click();
                }
                window.setTimeout(() => showDetail(id), 0);
            });
        });
    }

    function insertOverviewEntry() {
        const list = document.getElementById("drone-list");
        if (!list || document.getElementById("uav-overview-entry")) return;
        const entry = document.createElement("div");
        entry.id = "uav-overview-entry";
        entry.className = "uav-overview-card active";
        entry.innerHTML = `<span class="dot"></span><span><strong>无人机总览</strong><small>总体数据 / 位置 / 状态列表</small></span><em class="uav-menu-badge">总览</em>`;
        entry.addEventListener("click", showOverview);
        list.prepend(entry);
    }

    function bindDroneMenuMirror() {
        document.getElementById("drone-list")?.addEventListener("click", event => {
            const item = event.target.closest(".drone-item");
            if (!item || event.target.closest(".settings-btn")) return;
            if (item.querySelector(".status-dot")?.classList.contains("offline")) return;
            window.setTimeout(() => showDetail(item.dataset.id), 0);
        });
    }

    function bindSettingsVisibility() {
        const section = document.querySelector(".video-section");
        const close = document.getElementById("closeSettingsBtn");
        document.querySelectorAll(".settings-btn").forEach(button => {
            button.addEventListener("click", () => section?.classList.add("uav-settings-open"));
        });
        close?.addEventListener("click", () => {
            window.setTimeout(() => section?.classList.remove("uav-settings-open"), 0);
        });
    }

    function initUavDashboard() {
        const section = document.querySelector(".video-section");
        const controls = document.getElementById("video-controls-bar");
        const wrapper = document.getElementById("video-wrapper");
        if (!section || !controls || !wrapper) return;

        insertOverviewEntry();
        bindDroneMenuMirror();
        bindSettingsVisibility();

        const dashboard = document.createElement("div");
        dashboard.id = "uav-dashboard-view";
        dashboard.className = "uav-dashboard-view";

        const detail = document.createElement("div");
        detail.id = "uav-detail-view";
        detail.className = "uav-detail-view uav-hidden";

        section.insertBefore(dashboard, controls);
        section.insertBefore(detail, controls);
        showOverview();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initUavDashboard);
    } else {
        initUavDashboard();
    }
})();

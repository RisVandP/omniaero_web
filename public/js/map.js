/**
 * OmniAero-OBB 奥米天鉴 - 天眼 GIS 指挥舱 (交通管理者重构版)
 * 核心逻辑：航点实时拖拽微调 & 橡皮筋绘图 & AI异常侦测 & 拖拽式大盘
 */

const MAP_EVENT_DETECTION_PAUSED_KEY = 'omni_pause_map_event_detection';

function isMapEventDetectionPaused() {
    return localStorage.getItem(MAP_EVENT_DETECTION_PAUSED_KEY) === 'true';
}

window.isMapEventDetectionPaused = isMapEventDetectionPaused;

window.addEventListener('storage', (event) => {
    if (event.key === MAP_EVENT_DETECTION_PAUSED_KEY && typeof window.showToast === 'function') {
        window.showToast(
            isMapEventDetectionPaused() ? '地图新的道路异常识别已暂停' : '地图道路异常识别已恢复',
            2600
        );
    }
});

function shouldUseVehicleAmap() {
    const stored = localStorage.getItem('theme') || localStorage.getItem('omni_theme') || '';
    const htmlTheme = document.documentElement.dataset.theme || '';
    const bodyTheme = document.body?.dataset.theme || '';
    return [stored, htmlTheme, bodyTheme].some(value => String(value).toLowerCase().includes('dark'));
}

function installVehicleAmapBMapShim() {
    if (typeof AMap === 'undefined' || window.__vehicleAmapBMapShimInstalled) return false;
    window.__vehicleAmapBMapShimInstalled = true;

    const toLngLat = point => new AMap.LngLat(Number(point.lng), Number(point.lat));
    const toPoint = lngLat => new window.BMapGL.Point(lngLat.lng, lngLat.lat);
    const normalizePath = points => (points || []).map(toLngLat);

    function Point(lng, lat) {
        this.lng = Number(lng);
        this.lat = Number(lat);
    }

    function Overlay() {}

    function AmapShimMap(containerId) {
        const container = document.getElementById(containerId);
        this._container = container;
        this._heading = 0;
        this._tilt = 0;
        this._customOverlays = new Set();
        this._cursor = 'default';
        this._suppressInitialCamera = true;
        container.classList.add('vehicle-amap-host');
        this._pane = document.createElement('div');
        this._pane.className = 'vehicle-amap-overlay-pane';
        container.appendChild(this._pane);
        this._amap = new AMap.Map(container, {
            viewMode: '3D',
            zoom: 4.35,
            pitch: 22,
            rotation: 0,
            center: new AMap.LngLat(104.2, 35.8),
            resizeEnable: true,
            mapStyle: 'amap://styles/darkblue'
        });
        container.appendChild(this._pane);
        const redraw = () => this._customOverlays.forEach(overlay => overlay.draw?.());
        ['mapmove', 'zoomchange', 'rotatechange', 'pitchchange', 'complete'].forEach(name => this._amap.on(name, redraw));
    }

AmapShimMap.prototype.centerAndZoom = function(point, zoom) {
    if (this._suppressInitialCamera) {
        this._amap.setZoomAndCenter(4.35, new AMap.LngLat(104.2, 35.8), false, 0);
        return;
    }
    this._amap.setZoomAndCenter(Number(zoom), toLngLat(point));
};
    AmapShimMap.prototype.enableScrollWheelZoom = function() {};
AmapShimMap.prototype.setTilt = function(value) {
    if (this._suppressInitialCamera && Number(value) === 70) return;
    this._tilt = Number(value) || 0;
    if (this._amap.setPitch) this._amap.setPitch(this._tilt);
};
    AmapShimMap.prototype.getTilt = function() { return this._tilt; };
AmapShimMap.prototype.setHeading = function(value) {
    if (this._suppressInitialCamera && Number(value) === 20) return;
    this._heading = Number(value) || 0;
    if (this._amap.setRotation) this._amap.setRotation(this._heading);
};
    AmapShimMap.prototype.getHeading = function() { return this._heading; };
AmapShimMap.prototype.setDisplayOptions = function() {
    this._suppressInitialCamera = false;
};
    AmapShimMap.prototype.setMapStyleV2 = function() {};
    AmapShimMap.prototype.setDefaultCursor = function(cursor) {
        this._cursor = cursor || 'default';
        this._container.style.cursor = this._cursor;
    };
    AmapShimMap.prototype.getPanes = function() {
        return { labelPane: this._pane };
    };
    AmapShimMap.prototype.pointToOverlayPixel = function(point) {
        const pixel = this._amap.lngLatToContainer(toLngLat(point));
        return pixel ? { x: pixel.x, y: pixel.y } : null;
    };
    AmapShimMap.prototype.setViewport = function(points, options = {}) {
        const normalized = (points || []).map(toLngLat);
        if (normalized.length === 1) {
            const zoom = options.zoomFactor || this._amap.getZoom();
            this._amap.setZoomAndCenter(zoom, normalized[0], false, options.enableAnimation ? 500 : 0);
        } else if (normalized.length > 1) {
            this._amap.setFitView(normalized, false, [80, 80, 80, 80], this._amap.getZoom(), options.enableAnimation ? 500 : 0);
        }
    };
    AmapShimMap.prototype.setCenter = function(point) {
        this._amap.setCenter(toLngLat(point));
    };
    AmapShimMap.prototype.setZoom = function(zoom) {
        this._amap.setZoom(Number(zoom));
    };
    AmapShimMap.prototype.getZoom = function() {
        return this._amap.getZoom();
    };
    AmapShimMap.prototype.addEventListener = function(type, handler) {
        const mapEvent = type === 'zoomend' ? 'zoomchange' : type;
        this._amap.on(mapEvent, event => {
            const lngLat = event.lnglat || this._amap.getCenter();
            handler({
                latlng: { lng: lngLat.lng, lat: lngLat.lat },
                point: new Point(lngLat.lng, lngLat.lat),
                domEvent: event
            });
        });
    };
    AmapShimMap.prototype.addOverlay = function(overlay) {
        if (!overlay) return;
        if (overlay.__amapAddTo) {
            overlay.__amapAddTo(this);
            return;
        }
        overlay._map = this;
        if (!overlay._div && overlay.initialize) overlay.initialize(this);
        this._customOverlays.add(overlay);
        overlay.draw?.();
    };
    AmapShimMap.prototype.removeOverlay = function(overlay) {
        if (!overlay) return;
        if (overlay.__amapRemoveFrom) {
            overlay.__amapRemoveFrom(this);
            return;
        }
        this._customOverlays.delete(overlay);
        if (overlay._div?.parentNode) overlay._div.parentNode.removeChild(overlay._div);
        overlay._div = null;
    };

    function Polyline(points, options = {}) {
        this._points = points || [];
        this._options = options;
        this._amapObject = null;
    }
    Polyline.prototype.__amapAddTo = function(map) {
        if (!this._amapObject) {
            this._amapObject = new AMap.Polyline({
                path: normalizePath(this._points),
                strokeColor: this._options.strokeColor || '#38bdf8',
                strokeWeight: this._options.strokeWeight || 3,
                strokeOpacity: this._options.strokeOpacity ?? 0.8,
                strokeStyle: this._options.strokeStyle || 'solid',
                lineJoin: 'round',
                lineCap: 'round',
                zIndex: 30
            });
        }
        map._amap.add(this._amapObject);
    };
    Polyline.prototype.__amapRemoveFrom = function(map) {
        if (this._amapObject) map._amap.remove(this._amapObject);
    };
    Polyline.prototype.setPath = function(points) {
        this._points = points || [];
        this._amapObject?.setPath(normalizePath(this._points));
    };
    Polyline.prototype.setStrokeColor = function(color) {
        this._options.strokeColor = color;
        this._amapObject?.setOptions({ strokeColor: color });
    };
    Polyline.prototype.hide = function() { this._amapObject?.hide(); };
    Polyline.prototype.show = function() { this._amapObject?.show(); };

    function Polygon(points, options = {}) {
        Polyline.call(this, points, options);
    }
    Polygon.prototype = Object.create(Polyline.prototype);
    Polygon.prototype.constructor = Polygon;
    Polygon.prototype.__amapAddTo = function(map) {
        if (!this._amapObject) {
            this._amapObject = new AMap.Polygon({
                path: normalizePath(this._points),
                strokeColor: this._options.strokeColor || '#3b82f6',
                strokeWeight: this._options.strokeWeight || 2,
                strokeOpacity: this._options.strokeOpacity ?? 0.8,
                fillColor: this._options.fillColor || '#3b82f6',
                fillOpacity: this._options.fillOpacity ?? 0.15,
                zIndex: 30
            });
        }
        map._amap.add(this._amapObject);
    };
    Polygon.prototype.setOptions = function(options) {
        this._options = { ...this._options, ...options };
        this._amapObject?.setOptions(options);
    };
    Polygon.prototype.on = function(type, handler) {
        this._amapObject?.on(type, handler);
        this._pendingEvents = this._pendingEvents || [];
        this._pendingEvents.push([type, handler]);
    };

    function Marker(point) {
        this._point = point;
        this._marker = null;
    }
Marker.prototype.__amapAddTo = function(map) {
    if (!this._marker) {
        this._marker = new AMap.Marker({
            position: toLngLat(this._point),
            draggable: false,
                content: '<div class="vehicle-edit-point"></div>',
            offset: new AMap.Pixel(-7, -7)
        });
    }
    map._amap.add(this._marker);
    if (this._draggable) this._marker.setDraggable(true);
    if (this._pendingBind) {
        this._pendingBind();
        this._pendingBind = null;
    }
};
    Marker.prototype.__amapRemoveFrom = function(map) {
        if (this._marker) map._amap.remove(this._marker);
    };
    Marker.prototype.enableDragging = function() {
        this._marker?.setDraggable(true);
        this._draggable = true;
    };
    Marker.prototype.addEventListener = function(type, handler) {
        const mapType = type === 'dragend' ? 'dragend' : type;
        const bind = () => this._marker?.on(mapType, event => {
            const position = event.lnglat || this._marker.getPosition();
            this._point = toPoint(position);
            handler({ point: this._point, latlng: { lng: this._point.lng, lat: this._point.lat } });
        });
        if (this._marker) bind();
        else this._pendingBind = bind;
    };
    Marker.prototype.getPosition = function() {
        const position = this._marker?.getPosition();
        return position ? toPoint(position) : this._point;
    };

    window.BMapGL = { Point, Overlay, Map: AmapShimMap, Polyline, Polygon, Marker };
    document.body.classList.add('vehicle-amap-mode');
    return true;
}

const style = document.createElement('style');
style.innerHTML = `
    .station-marker { position: absolute; transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center; z-index: 10; cursor: pointer; transition: transform 0.2s; }
    .station-marker:hover { transform: translate(-50%, -100%) scale(1.1); z-index: 999; }
    .station-icon { font-size: 36px; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.6)); }
    .station-name { background: rgba(15,23,42,0.9); color: #38bdf8; padding: 4px 10px; border-radius: 6px; font-size: 13px; font-weight: bold; border: 1px solid #334155; margin-top: 4px; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,0.6); }
    
    #draw-ui-panel { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: rgba(15,23,42,0.9); backdrop-filter: blur(10px); border: 1px solid #38bdf8; border-radius: 30px; padding: 10px 24px; display: flex; align-items: center; gap: 16px; z-index: 3000; box-shadow: 0 10px 30px rgba(0,0,0,0.5); display: none; }
    #draw-ui-text { color: #f8fafc; font-weight: bold; font-size: 14px; }
    .draw-btn { background: #38bdf8; color: #0f172a; border: none; padding: 6px 16px; border-radius: 20px; font-weight: bold; cursor: pointer; }
    .draw-btn.cancel { background: transparent; border: 1px solid #ef4444; color: #ef4444; }
    .draw-btn.hidden { display: none; }

    /* 拖拽式事件大盘 CSS */
    .alert-category { margin-bottom: 16px; }
    .alert-category-title { font-size: 14px; font-weight: bold; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; color: #f8fafc; background: rgba(0,0,0,0.2); border-radius: 8px; }
    .sub-content { transition: max-height 0.3s ease, opacity 0.3s ease; max-height: 1000px; opacity: 1; overflow: hidden; margin-top: 8px; }
    .sub-content.collapsed { max-height: 0px; opacity: 0; margin-top: 0; pointer-events: none; }
    
    .alert-drop-zone { min-height: 70px; padding: 10px; transition: all 0.2s; border-radius: 8px; background: rgba(0,0,0,0.15); border: 2px dashed transparent; }
    .alert-drop-zone.drag-over { background: rgba(0,0,0,0.4); border: 2px dashed #38bdf8; }
    
    .alert-card { border-radius: 6px; padding: 12px; margin-bottom: 10px; cursor: grab; transition: transform 0.2s; background: rgba(30,41,59,0.8); border-left: 4px solid #fff; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
    .alert-card:active { cursor: grabbing; transform: scale(0.98); }
    .alert-card.danger { border-left-color: #ef4444; background: rgba(239, 68, 68, 0.15); }
    .alert-card.warning { border-left-color: #f59e0b; background: rgba(245, 158, 11, 0.15); }
    .alert-card.info { border-left-color: #10b981; background: rgba(16, 185, 129, 0.15); }
    
    .alert-title-row { display: flex; justify-content: space-between; align-items: center; font-weight: bold; font-size: 14px; color: #fff;}
    .alert-detail-row { font-size: 12px; color: #cbd5e1; display: flex; justify-content: space-between; align-items: center;}
`;
document.head.appendChild(style);

const drawPanel = document.createElement('div');
drawPanel.id = 'draw-ui-panel';
drawPanel.innerHTML = `
    <span id="draw-ui-text">🎯 请在地图上操作...</span>
    <button id="draw-finish-btn" class="draw-btn">✅ 完成下发</button>
    <button id="draw-cancel-btn" class="draw-btn cancel">❌ 取消</button>
`;
document.body.appendChild(drawPanel);

document.getElementById('draw-finish-btn').addEventListener('click', () => {
    if (window.drawState.active) window.finishDrawing();
    if (window.editState.active) window.finishEditing();
});
document.getElementById('draw-cancel-btn').addEventListener('click', () => {
    if (window.drawState.active) window.cancelDrawing();
    if (window.editState.active) window.cancelEditing();
});

// ==========================================
// 1. 全局 UI 状态机与导航逻辑 
// ==========================================

window.missionStations = [
    { id: 's1', name: ' 北门主起降站', status: '正常待命', lng: 103.9800, lat: 30.7700, drones: ['无人机1号'] },
    { id: 's2', name: ' 西源大道执勤站', status: '正常待命', lng: 103.9750, lat: 30.7750, drones: ['无人机2号'] },
    { id: 's3', name: ' 南门应急起降点', status: '正常待命', lng: 104.0000, lat: 30.7580, drones: ['无人机3号'] },
    { id: 's4', name: ' 体育馆楼顶子站', status: '正常待命', lng: 103.9780, lat: 30.7550, drones: ['无人机4号'] }
];

window.mockAddressPool = ['西源大道', '犀安路东段', '交大北门主干道', '体育馆南侧辅路', '图书馆东侧广场边界', '校园环路北段', '实验楼A区路口'];

window.openModule = function(moduleName) {
    document.querySelectorAll('.dock-item').forEach(btn => btn.classList.remove('active'));
    document.getElementById('dock-btn-' + moduleName).classList.add('active');
    closeDrawer('right'); closeEventModal();
    document.getElementById('right-drawer')?.classList.remove('vehicle-drone-control-drawer');

    if (moduleName === 'drone' && typeof window.renderVehicleGisDronePanel === 'function') {
        window.renderVehicleGisDronePanel();
        return;
    }

    const leftDrawer = document.getElementById('left-drawer');
    const leftTitle = document.getElementById('left-drawer-title');
    const leftContent = document.getElementById('left-drawer-content');
    leftDrawer.classList.remove('collapsed');

    if (moduleName === 'dispatch') {
        leftTitle.innerText = ' 任务站列表';
        leftContent.innerHTML = window.missionStations.map(station => `
            <div class="g-card" onclick="openStationDetail('${station.id}')">
                <div class="g-card-title"><span>${station.name}</span> <span style="color:#10b981">运行中</span></div>
                <div class="g-card-sub">待命无人机: ${station.drones.length} 架 | 状态: ${station.status}</div>
            </div>
        `).join('');
    } 
    else if (moduleName === 'drone') {
        leftTitle.innerText = '任务中飞行器';
        const activeDrones = window.fleet ? window.fleet.map((d, i) => ({...d, originalIndex: i})).filter(d => d.isActive) : [];
        if (activeDrones.length === 0) {
            leftContent.innerHTML = `<div style="text-align:center; color:#64748b; margin-top: 40px; font-size: 13px;">当前无正在执行任务的无人机<br>请在【巡逻派遣】中下发指令</div>`;
        } else {
            leftContent.innerHTML = activeDrones.map(drone => `
                <div class="g-card" onclick="openDroneDetail(${drone.originalIndex})">
                    <div class="g-card-title"><span>${drone.name}</span> <span style="color:#10b981">在线</span></div>
                    <div class="g-card-sub">状态: ${drone.missionState === 'returning' ? '返航中' : (drone.patrolMode === 'area' ? '区域排查' : '沿线巡逻')} | 速度: 15m/s</div>
                </div>
            `).join('');
        }
    }
    else if (moduleName === 'event') {
        leftDrawer.classList.add('collapsed');
        openEventModal();
    }
};

window.closeDrawer = function(side) {
    const drawer = document.getElementById(side + '-drawer');
    drawer.classList.add('collapsed');
    if (side === 'right') drawer.classList.remove('vehicle-drone-control-drawer');
};
window.closeEventModal = function() { document.getElementById('event-modal').classList.add('collapsed'); document.getElementById('dock-btn-event').classList.remove('active'); };

window.currentSelectedStation = null;

window.openStationDetail = function(stationId) {
    window.currentSelectedStation = stationId;
    const station = window.missionStations.find(s => s.id === stationId);
    document.getElementById('right-drawer').classList.remove('collapsed', 'vehicle-drone-control-drawer');
    document.getElementById('right-drawer-title').innerText = '任务调度中枢';
    
    const stationPoint = new BMapGL.Point(station.lng, station.lat);
    window.map.setViewport([stationPoint], { zoomFactor: 17, enableAnimation: true });

    document.getElementById('right-drawer-content').innerHTML = `
        <div style="color: #94a3b8; font-size: 13px; margin-bottom: 10px;">当前选定站点：<span style="color:#fff">${station.name}</span></div>
        <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 12px; margin-bottom: 15px;">
            <div style="color:#38bdf8; font-size: 13px; margin-bottom:8px;">库内可用无人机：</div>
            ${station.drones.map(d => {
                let drone = window.fleet ? window.fleet.find(f => f.name === d) : null;
                let isActive = drone ? drone.isActive : false;
                let statusColor = isActive ? '#ef4444' : '#10b981';
                let statusText = isActive ? '执勤中' : '待命就绪';
                return `<div style="display:flex; justify-content:space-between; color:#f8fafc; font-size:14px; font-weight:bold; margin-bottom:4px;">
                            <span>${d}</span><span style="color:${statusColor}; font-size:12px;">${statusText}</span>
                        </div>`;
            }).join('')}
        </div>
        <button class="g-btn primary" onclick="startDispatchDraw('route')">派遣：划定巡逻路线</button>
        <button class="g-btn" style="border: 1px solid #38bdf8; color:#38bdf8; background:rgba(56,189,248,0.1)" onclick="startDispatchDraw('area')">派遣：划定排查区域</button>
    `;
};

// ==========================================
// 🌟 交互绘制与【节点微调】引擎 
// ==========================================
window.drawState = { active: false, points: [], type: '', overlay: null, tempOverlay: null, targetDrone: null };
window.editState = { active: false, markers: [], drone: null, originalPath: [] }; // 新增微调状态

window.startDispatchDraw = function(type) {
    if (!window.currentSelectedStation) return;
    if (typeof window.setVehicleGisProvinceInteractive === 'function') {
        window.setVehicleGisProvinceInteractive(false);
    }
    const station = window.missionStations.find(s => s.id === window.currentSelectedStation);
    const targetDroneName = station.drones.find(dName => { const d = window.fleet.find(f => f.name === dName); return d && !d.isActive; });
    if (!targetDroneName) { window.showToast(`⚠️ [${station.name}] 无可用设备！`, 3000); return; }
    closeDrawer('right'); window.startDrawing(type, targetDroneName, station);
};

window.startDrawing = function(type, targetDroneName, station) {
    window.drawState = { active: true, points: [], type: type, overlay: null, tempOverlay: null, targetDrone: targetDroneName, station: station };
    const uiPanel = document.getElementById('draw-ui-panel');
    const finishBtn = document.getElementById('draw-finish-btn');
    uiPanel.style.display = 'flex';
    
    if (type === 'route') { document.getElementById('draw-ui-text').innerText = ' 路线设定: 点击确认航点，移动查看走向，最后点击【完成下发】'; finishBtn.classList.remove('hidden'); } 
    else { document.getElementById('draw-ui-text').innerText = '区域设定: 请在地图上【点击两次】以划定矩形的两个对角点...'; finishBtn.classList.add('hidden'); }
    window.map.setDefaultCursor("crosshair");
};

window.mapClickListener = function(e) {
    if (!window.drawState.active) return;
    const pt = new BMapGL.Point(e.latlng.lng, e.latlng.lat);
    if (window.drawState.type === 'route') {
        window.drawState.points.push(pt);
        if (window.drawState.overlay) window.map.removeOverlay(window.drawState.overlay);
        if (window.drawState.points.length > 1) {
            window.drawState.overlay = new BMapGL.Polyline(window.drawState.points, { strokeColor: "#38bdf8", strokeWeight: 4, strokeOpacity: 0.8, strokeStyle: "solid" });
            window.map.addOverlay(window.drawState.overlay);
        }
    } else if (window.drawState.type === 'area') {
        window.drawState.points.push(pt);
        if (window.drawState.points.length === 2) { window.finishDrawing(); }
    }
};

window.mapMouseMoveListener = function(e) {
    if (!window.drawState.active || window.drawState.points.length === 0) return;
    const currentPt = new BMapGL.Point(e.latlng.lng, e.latlng.lat);
    if (window.drawState.tempOverlay) window.map.removeOverlay(window.drawState.tempOverlay);

    if (window.drawState.type === 'route') {
        const lastPt = window.drawState.points[window.drawState.points.length - 1];
        window.drawState.tempOverlay = new BMapGL.Polyline([lastPt, currentPt], { strokeColor: "#38bdf8", strokeWeight: 3, strokeOpacity: 0.5, strokeStyle: "dashed" });
        window.map.addOverlay(window.drawState.tempOverlay);
    } 
    else if (window.drawState.type === 'area' && window.drawState.points.length === 1) {
        const startPt = window.drawState.points[0];
        const rectPoints = [ new BMapGL.Point(startPt.lng, startPt.lat), new BMapGL.Point(currentPt.lng, startPt.lat), new BMapGL.Point(currentPt.lng, currentPt.lat), new BMapGL.Point(startPt.lng, currentPt.lat) ];
        window.drawState.tempOverlay = new BMapGL.Polygon(rectPoints, { strokeColor: "#3b82f6", strokeWeight: 2, strokeOpacity: 0.8, fillColor: "#3b82f6", fillOpacity: 0.2 });
        window.map.addOverlay(window.drawState.tempOverlay);
    }
};

window.cancelDrawing = function() {
    window.drawState.active = false; window.map.setDefaultCursor("default");
    document.getElementById('draw-ui-panel').style.display = 'none';
    if (window.drawState.overlay) window.map.removeOverlay(window.drawState.overlay);
    if (window.drawState.tempOverlay) window.map.removeOverlay(window.drawState.tempOverlay);
    if (typeof window.setVehicleGisProvinceInteractive === 'function') {
        window.setVehicleGisProvinceInteractive(!window.currentSelectedStation);
    }
};

window.finishDrawing = function() {
    if (window.drawState.type === 'route' && window.drawState.points.length < 2) { window.showToast(" 路线至少需要点击 2 个节点！"); return; }
    if (window.drawState.type === 'area' && window.drawState.points.length !== 2) { window.showToast("区域需要点击对角两个点！"); return; }

    window.drawState.active = false; window.map.setDefaultCursor("default");
    document.getElementById('draw-ui-panel').style.display = 'none';
    if (window.drawState.tempOverlay) window.map.removeOverlay(window.drawState.tempOverlay);

    const drone = window.fleet.find(d => d.name === window.drawState.targetDrone);
    let finalOverlay = null;

    if (window.drawState.type === 'route') {
        finalOverlay = new BMapGL.Polyline(window.drawState.points, { strokeColor: "#38bdf8", strokeWeight: 4, strokeOpacity: 0.8, strokeStyle: "solid" });
        drone.targetPath = [...window.drawState.points];
    } else {
        const p1 = window.drawState.points[0]; const p2 = window.drawState.points[1];
        const rectPoints = [ new BMapGL.Point(p1.lng, p1.lat), new BMapGL.Point(p2.lng, p1.lat), new BMapGL.Point(p2.lng, p2.lat), new BMapGL.Point(p1.lng, p2.lat) ];
        finalOverlay = new BMapGL.Polygon(rectPoints, { strokeColor: "#3b82f6", strokeWeight: 2, strokeOpacity: 0.8, fillColor: "#3b82f6", fillOpacity: 0.15 });
        
        drone.patrolBounds = { minLng: Math.min(p1.lng, p2.lng), maxLng: Math.max(p1.lng, p2.lng), minLat: Math.min(p1.lat, p2.lat), maxLat: Math.max(p1.lat, p2.lat) };
        drone.targetPath = [new BMapGL.Point( drone.patrolBounds.minLng + Math.random() * (drone.patrolBounds.maxLng - drone.patrolBounds.minLng), drone.patrolBounds.minLat + Math.random() * (drone.patrolBounds.maxLat - drone.patrolBounds.minLat) )];
    }

    window.map.addOverlay(finalOverlay);
    if (drone.activeOverlay) window.map.removeOverlay(drone.activeOverlay);
    drone.activeOverlay = finalOverlay;
    if (window.drawState.overlay) window.map.removeOverlay(window.drawState.overlay);

    if (window.vehicleGisDeferLaunch && window.drawState.station) {
        const station = window.drawState.station;
        window.vehicleGisPendingMission = {
            drone,
            station,
            type: window.drawState.type,
            overlay: finalOverlay
        };
        window.showToast('巡检范围已生成，请在右侧控制栏点击开始巡检。', 3200);
        if (typeof window.renderVehicleGisDispatchPanel === 'function') {
            window.renderVehicleGisDispatchPanel(station.id);
        }
        return;
    }

    if (window.drawState.station) {
        const station = window.drawState.station;
        drone.isActive = true; drone.patrolMode = window.drawState.type;       
        drone.homePoint = new BMapGL.Point(station.lng, station.lat); drone.currentPoint = drone.homePoint; 
        drone.missionState = 'deploying'; drone.currentMovementPath = [drone.homePoint, drone.targetPath[0]]; 
        drone.movementLine.setStrokeColor("#10b981"); drone.movementLine.setPath([drone.currentPoint, drone.targetPath[0]]); drone.movementLine.show();
        window.showToast(`🚀 授权码已下发！${drone.name} 正起飞前往目标空域...`, 4000);
        setTimeout(() => openModule('drone'), 800); 
    } else {
        drone.patrolMode = window.drawState.type; drone.missionState = 'deploying'; 
        drone.currentMovementPath = [drone.currentPoint, drone.targetPath[0]]; 
        drone.movementLine.setStrokeColor("#10b981"); drone.movementLine.setPath([drone.currentPoint, drone.targetPath[0]]); drone.movementLine.show();
        window.showToast(`🔄 任务已更新！${drone.name} 正在强行切入新任务区...`, 4000);
    }
    
    drone.progress = 0; drone.pathIdx = 0; drone.direction = 1; window.updateLOD();
};

window.launchVehicleGisPendingMission = function() {
    const mission = window.vehicleGisPendingMission;
    if (!mission || !mission.drone || !mission.station) {
        window.showToast('请先绘制巡逻路线或排查区域。', 2600);
        return;
    }

    const { drone, station, type } = mission;
    const boot = document.getElementById('vehicle-gis-boot');
    if (boot) boot.classList.add('show');

    window.setTimeout(() => {
        if (boot) boot.classList.remove('show');
        drone.isActive = true;
        drone.patrolMode = type;
        drone.homePoint = new BMapGL.Point(station.lng, station.lat);
        drone.currentPoint = drone.homePoint;
        drone.missionState = 'deploying';
        drone.currentMovementPath = [drone.homePoint, drone.targetPath[0]];
        drone.movementLine.setStrokeColor("#10b981");
        drone.movementLine.setPath([drone.currentPoint, drone.targetPath[0]]);
        drone.movementLine.show();
        drone.progress = 0;
        drone.pathIdx = 0;
        drone.direction = 1;
        window.vehicleGisPendingMission = null;
        window.updateLOD();
        if (typeof window.setVehicleGisProvinceInteractive === 'function') window.setVehicleGisProvinceInteractive(false);
        if (typeof window.renderVehicleGisDronePanel === 'function') window.renderVehicleGisDronePanel();
        window.showToast(`空地协同巡检已启动：${drone.name} 正起飞前往目标空域。`, 4000);
    }, 2100);
};

// 🚨 新增：航线节点拖拽微调引擎
window.editDroneRoute = function(index) {
    const drone = window.fleet[index];
    if (drone.patrolMode !== 'route') {
        window.showToast("⚠️ 仅【沿线巡航】模式支持微调节点，区域排查请使用【重新划定区域】");
        return;
    }
    closeDrawer('right');
    
    // 强制无人机悬停
    drone.previousState = drone.missionState;
    drone.missionState = 'editing'; 

    window.editState.active = true;
    window.editState.drone = drone;
    window.editState.originalPath = [...drone.targetPath]; // 备份路线

    const uiPanel = document.getElementById('draw-ui-panel');
    document.getElementById('draw-ui-text').innerText = ' 正在微调节点：请拖动地图上的红色标记点修改航线';
    document.getElementById('draw-finish-btn').classList.remove('hidden');
    uiPanel.style.display = 'flex';

    // 生成可拖拽的控制点
    drone.targetPath.forEach((pt, i) => {
        let marker = new BMapGL.Marker(pt);
        marker.enableDragging(); // 允许拖拽
        // 监听拖动过程，实时重绘蓝色航线
        marker.addEventListener('dragging', function() {
            let pos = marker.getPosition();
            drone.targetPath[i] = new BMapGL.Point(pos.lng, pos.lat);
            if (drone.activeOverlay) drone.activeOverlay.setPath(drone.targetPath);
        });
        window.map.addOverlay(marker);
        window.editState.markers.push(marker);
    });
};

window.finishEditing = function() {
    window.editState.active = false;
    document.getElementById('draw-ui-panel').style.display = 'none';

    window.editState.markers.forEach(m => window.map.removeOverlay(m));
    window.editState.markers = [];

    const drone = window.editState.drone;
    // 恢复飞行：向修改后的最近目标点飞去
    drone.missionState = 'deploying'; 
    drone.currentMovementPath = [drone.currentPoint, drone.targetPath[0]]; 
    drone.progress = 0; drone.pathIdx = 0; drone.direction = 1;

    drone.movementLine.setStrokeColor("#10b981");
    drone.movementLine.setPath([drone.currentPoint, drone.targetPath[0]]);
    drone.movementLine.show();

    window.showToast(` ${drone.name} 航线微调完成，正在切入新航道...`, 4000);
    setTimeout(() => openModule('drone'), 800);
};

window.cancelEditing = function() {
    window.editState.active = false;
    document.getElementById('draw-ui-panel').style.display = 'none';

    window.editState.markers.forEach(m => window.map.removeOverlay(m));
    window.editState.markers = [];

    const drone = window.editState.drone;
    drone.targetPath = [...window.editState.originalPath]; // 还原路线
    if (drone.activeOverlay) drone.activeOverlay.setPath(drone.targetPath);

    drone.missionState = drone.previousState; // 恢复悬停前的状态
    window.showToast("已取消微调，无人机恢复原任务");
    openModule('drone');
};

// ----------------- 控制与 HUD 子模块 -----------------
window.openDroneDetail = function(index) {
    window.currentDetailIndex = index; window.focusedDroneIndex = index; var drone = window.fleet[index];
    document.getElementById('right-drawer').classList.remove('collapsed');
    document.getElementById('right-drawer').classList.add('vehicle-drone-control-drawer');
    document.getElementById('right-drawer-title').innerText = '无人机控制面板';
    window.isChaseMode = false;

    let statusHtml = '';
    if (drone.missionState === 'deploying') statusHtml = '<span class="status-tag" style="background:rgba(16,185,129,0.9); color:#fff; border:none;">部署前往中</span>';
    else if (drone.missionState === 'returning') statusHtml = '<span class="status-tag" style="background:rgba(239,68,68,0.9); color:#fff; border:none;">自动返航中</span>';
    else if (drone.missionState === 'editing') statusHtml = '<span class="status-tag" style="background:rgba(245,158,11,0.9); color:#fff; border:none;">航点修正悬停</span>';
    else statusHtml = '<span class="status-tag" style="background:rgba(56,189,248,0.9); color:#0f172a; border:none;">巡逻执勤中</span>';

    var videoMap = { '无人机1号': 'Video/无人机01号/rgb_video.mp4', '无人机2号': 'Video/无人机02号/rgb_video.mp4', '无人机3号': 'Video/无人机03号/rgb_video.mp4', '无人机4号': 'Video/无人机04号/rgb_video.mp4' };
    var videoSrc = videoMap[drone.name] || ''; let modeText = drone.patrolMode === 'area' ? '区域排查' : '沿线巡航';

    document.getElementById('right-drawer-content').innerHTML = `
        <div style="font-size:16px; font-weight:800; color:#fff; margin-bottom:12px; padding-left:4px; letter-spacing:1px;">${drone.name}</div>
        <div style="width: 100%; height: 220px; background: #000; border-radius: 12px; position: relative; overflow: hidden; border: 1px solid #334155; margin-bottom: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.6);">
            <video src="${videoSrc}" loop muted autoplay style="width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0; z-index: 1;"></video>
            <div style="position: absolute; top:0; left:0; width: 100%; padding: 10px 12px; background: linear-gradient(to bottom, rgba(0,0,0,0.7), transparent); display: flex; justify-content: space-between; align-items: flex-start; z-index: 2;">
                <div style="background: rgba(239,68,68,0.85); color:#fff; font-size:10px; padding:4px 8px; border-radius:4px; font-weight:bold; display:flex; align-items:center; gap:6px;">
                    <span class="rec-dot" style="width:6px; height:6px; background:#fff; border-radius:50%; display:inline-block; animation: blink 1s infinite;"></span> LIVE REC
                </div>
                ${statusHtml}
            </div>
            <div style="position: absolute; top:50%; left:50%; transform: translate(-50%, -50%); width: 30px; height: 30px; z-index: 2; pointer-events:none;">
                <div style="position:absolute; top:50%; left:0; width:8px; height:2px; background:rgba(56,189,248,0.7); transform:translateY(-50%);"></div>
                <div style="position:absolute; top:50%; right:0; width:8px; height:2px; background:rgba(56,189,248,0.7); transform:translateY(-50%);"></div>
                <div style="position:absolute; left:50%; top:0; width:2px; height:8px; background:rgba(56,189,248,0.7); transform:translateX(-50%);"></div>
                <div style="position:absolute; left:50%; bottom:0; width:2px; height:8px; background:rgba(56,189,248,0.7); transform:translateX(-50%);"></div>
            </div>
            <div style="position: absolute; bottom:0; left:0; width: 100%; padding: 12px; background: linear-gradient(to top, rgba(0,0,0,0.85), transparent); z-index: 2; display: flex; justify-content: space-between; align-items: flex-end;">
                <div style="display:flex; gap: 16px; font-family: 'Courier New', Courier, monospace;">
                    <div style="display:flex; flex-direction:column; align-items:flex-start;"><span style="color:#94a3b8; font-size:9px; font-weight:bold;">ALT (m)</span><span style="font-weight:bold; font-size:14px; color:#f8fafc;">120</span></div>
                    <div style="display:flex; flex-direction:column; align-items:flex-start;"><span style="color:#94a3b8; font-size:9px; font-weight:bold;">SPD (m/s)</span><span style="font-weight:bold; font-size:14px; color:#f8fafc;">18</span></div>
                    <div style="display:flex; flex-direction:column; align-items:flex-start;"><span style="color:#94a3b8; font-size:9px; font-weight:bold;">BAT (%)</span><span style="font-weight:bold; font-size:14px; color:#4ade80;">82</span></div>
                </div>
                <div style="background: rgba(255,255,255,0.15); backdrop-filter:blur(4px); color:#fff; font-size:11px; padding:4px 8px; border-radius:4px; border: 1px solid rgba(255,255,255,0.2);">${modeText}</div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <button class="g-btn primary" onclick="enterChaseCamera(event)" style="margin: 0; padding: 10px 0; border-radius: 8px; font-size: 13px; grid-column: span 2; box-shadow:0 4px 12px rgba(59,130,246,0.3);">开启 3D 尾随视角</button>
            
            <button class="g-btn" onclick="editDroneRoute(${index})" style="margin: 0; padding: 10px 0; border-radius: 8px; font-size: 12px; background: rgba(255,255,255,0.05); border: 1px solid #334155; color:#e2e8f0; display: ${drone.patrolMode === 'route' ? 'block' : 'none'};">微调当前路线节点</button>
            
            <button class="g-btn" onclick="modifyDroneRoute(${index}, 'route')" style="margin: 0; padding: 10px 0; border-radius: 8px; font-size: 12px; background: rgba(255,255,255,0.05); border: 1px solid #334155; color:#e2e8f0; grid-column: ${drone.patrolMode === 'route' ? 'span 1' : 'span 2'};">重新绘制路线</button>
            
            <button class="g-btn" onclick="modifyDroneRoute(${index}, 'area')" style="margin: 0; padding: 10px 0; border-radius: 8px; font-size: 12px; background: rgba(255,255,255,0.05); border: 1px solid #334155; color:#e2e8f0; grid-column: span 2;">重新划定排查区域</button>
            
            <button class="g-btn" style="margin: 0; padding: 10px 0; border-radius: 8px; font-size: 13px; background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.4); grid-column: span 2;" onclick="commandReturn(${index})">终止任务并紧急返航</button>
        </div>
    `;
};

window.modifyDroneRoute = function(index, type) { const drone = window.fleet[index]; closeDrawer('right'); window.startDrawing(type, drone.name, null); };
window.commandReturn = function(index) {
    const drone = window.fleet[index]; closeDrawer('right');
    drone.missionState = 'returning'; drone.currentMovementPath = [drone.currentPoint, drone.homePoint]; 
    drone.progress = 0; drone.pathIdx = 0; drone.direction = 1;
    drone.movementLine.setStrokeColor("#ef4444"); drone.movementLine.setPath([drone.currentPoint, drone.homePoint]); drone.movementLine.show();
    if (drone.activeOverlay) { window.map.removeOverlay(drone.activeOverlay); drone.activeOverlay = null; }
    window.showToast(`🏠 收到强行召回指令！${drone.name} 终止任务，正在直线返回机巢...`, 4000); openModule('drone'); 
};


// ==========================================
// 🌟 动态 AI 异常侦测引擎 & 拖拽式工单大盘
// ==========================================
window.alertLibrary = [
    { title: "路面重度塌陷", severity: "danger", img: "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=400&q=80" },
    { title: "大型交通事故", severity: "danger", img: "F://服务外包//Omniserver//public//image//crash.png" },
];

window.activeAlerts = []; window.alertMarkersMap = {}; 

function generateDragCards(severity) {
    const list = window.activeAlerts.filter(a => a.severity === severity);
    if (list.length === 0) return `<div style="text-align:center; color:#64748b; font-size:12px; padding:20px 0;">暂无此类事件，可将卡片拖拽至此修改等级</div>`;
    return list.map(a => `
        <div class="alert-card ${a.severity}" draggable="true" ondragstart="dragStart(event, '${a.id}')">
            <div class="alert-title-row">
                <span>${a.title}</span>
                <span style="font-size:12px; font-weight:normal; color:#38bdf8;">发现者: ${a.droneName}</span>
            </div>
            <div class="alert-detail-row">
                <span style="color:#f8fafc; font-weight:bold;"> ${a.address}</span>
                <span>🕒 ${a.timestamp}</span>
            </div>
            <div class="alert-detail-row" style="margin-top:6px; border-top:1px solid rgba(255,255,255,0.08); padding-top:8px;">
                <span style="font-family:monospace;">${a.point.lng.toFixed(5)}, ${a.point.lat.toFixed(5)}</span>
                <div style="display:flex; gap:8px;">
                    <button class="g-btn" style="padding: 4px 12px; font-size:12px; width:auto; margin:0; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2);" onclick="showAlertPopup('${a.id}')">查看现场</button>
                    <button class="g-btn primary" style="padding: 4px 12px; font-size:12px; width:auto; margin:0;" onclick="openProcessForm('${a.id}')">处理事件</button>
                </div>
            </div>
        </div>
    `).join('');
}

window.openEventModal = function() {
    document.getElementById('event-modal').classList.remove('collapsed');
    
    document.getElementById('event-modal-content').innerHTML = `
        <div style="font-size:12px; color:#94a3b8; margin-bottom:16px;">
            ${isMapEventDetectionPaused() ? '⏸ 当前已暂停新的道路异常识别，已存在事件仍可继续处理。<br>' : ''}
            💡 提示：按住卡片并拖拽，可以重新评估并修改该事件的严重等级，地图警戒圈大小将实时同步。
        </div>
        
        <div class="alert-category">
            <div class="alert-category-title" onclick="toggleEventPanel('sub-danger')">
                <span style="color:#ef4444;">🔴 紧急危险事件 (<span id="c-danger">${window.activeAlerts.filter(a=>a.severity==='danger').length}</span>)</span> <span>▼</span>
            </div>
            <div class="sub-content" id="sub-danger">
                <div class="alert-drop-zone" ondragenter="event.preventDefault()" ondragover="dragOver(event)" ondragleave="dragLeave(event)" ondrop="dropAlert(event, 'danger')">
                    ${generateDragCards('danger')}
                </div>
            </div>
        </div>

        <div class="alert-category">
            <div class="alert-category-title" onclick="toggleEventPanel('sub-warning')">
                <span style="color:#f59e0b;">🟡 次紧急状况 (<span id="c-warning">${window.activeAlerts.filter(a=>a.severity==='warning').length}</span>)</span> <span>▼</span>
            </div>
            <div class="sub-content" id="sub-warning">
                <div class="alert-drop-zone" ondragenter="event.preventDefault()" ondragover="dragOver(event)" ondragleave="dragLeave(event)" ondrop="dropAlert(event, 'warning')">
                    ${generateDragCards('warning')}
                </div>
            </div>
        </div>

        <div class="alert-category">
            <div class="alert-category-title" onclick="toggleEventPanel('sub-info')">
                <span style="color:#10b981;">🟢 一般性记录 (<span id="c-info">${window.activeAlerts.filter(a=>a.severity==='info').length}</span>)</span> <span>▼</span>
            </div>
            <div class="sub-content" id="sub-info">
                <div class="alert-drop-zone" ondragenter="event.preventDefault()" ondragover="dragOver(event)" ondragleave="dragLeave(event)" ondrop="dropAlert(event, 'info')">
                    ${generateDragCards('info')}
                </div>
            </div>
        </div>
    `;
};

window.toggleEventPanel = function(id) {
    const el = document.getElementById(id);
    if (el.classList.contains('collapsed')) el.classList.remove('collapsed'); else el.classList.add('collapsed');
};

// 🚨 拖拽引擎优化：解决不响应问题，并联动地图覆盖物重绘
window.dragStart = function(e, id) { 
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id); 
    e.dataTransfer.setData('text', id); // 兼容老版本浏览器
};

window.dragOver = function(e) { 
    e.preventDefault(); // 🚨 强制阻止浏览器默认行为，允许 Drop
    e.dataTransfer.dropEffect = 'move';
    let dropZone = e.target.closest('.alert-drop-zone');
    if(dropZone) dropZone.classList.add('drag-over'); 
};

window.dragLeave = function(e) { 
    let dropZone = e.target.closest('.alert-drop-zone');
    // 只有鼠标真正离开外层容器才取消高亮，防止内部元素导致狂闪
    if(dropZone && !dropZone.contains(e.relatedTarget)) {
        dropZone.classList.remove('drag-over'); 
    }
};

window.dropAlert = function(e, newSeverity) {
    e.preventDefault(); 
    e.stopPropagation();
    
    let dropZone = e.target.closest('.alert-drop-zone');
    if(dropZone) dropZone.classList.remove('drag-over');
    
    // 安全获取卡片 ID
    const id = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text');
    if (!id) return; 

    const alertIdx = window.activeAlerts.findIndex(a => a.id === id);
    
    if (alertIdx > -1) {
        const oldSeverity = window.activeAlerts[alertIdx].severity;
        
        // 如果确实拖到了新的等级区域
        if (oldSeverity !== newSeverity) {
            // 1. 更新后台数据源
            window.activeAlerts[alertIdx].severity = newSeverity; 
            
            // 2. 🚨 核心联动：强制销毁旧的地图覆盖物，根据新等级生成新的覆盖物！
            if (window.alertMarkersMap[id]) {
                window.map.removeOverlay(window.alertMarkersMap[id]); // 抹除旧的圈
                
                // 重新实例化，此时由于传入了 newSeverity，它会自动去匹配 CSS 中对应的半径大小 (150px / 90px / 50px)
                let newMarker = new AlertMarkerOverlay(window.activeAlerts[alertIdx].point, newSeverity, id);
                window.map.addOverlay(newMarker);
                window.alertMarkersMap[id] = newMarker;
                newMarker.show();
            }
            
            // 3. 刷新大盘 UI 并提示
            window.openEventModal(); 
            window.showToast("事件严重等级已重新评估，地图警戒范围已同步改变！", 4000);
        }
    }
};

window.openProcessForm = function(id) {
    let a = window.activeAlerts.find(x => x.id === id); if(!a) return;
    map.setViewport([a.point], { zoomFactor: 19, enableAnimation: true });
    window.anomalyPopup.setPosition(a.point); 
    window.anomalyPopup.setContent(`
        <div style="padding: 12px; background: #0f172a; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #38bdf8; font-weight: bold; font-size: 13px;">事件处理工单下发</span>
            <div class="popup-close" onclick="closeAlertPopup()" style="position: static; font-size: 18px; cursor: pointer;">×</div>
        </div>
        <div style="padding: 16px; background: #1e293b;">
            <div style="font-weight: bold; color: #f8fafc; font-size: 15px; margin-bottom: 6px;">${a.title}</div>
            <div style="font-size: 12px; color:#94a3b8; margin-bottom: 16px; display:flex; gap:10px;">
                <span> ${a.address}</span> | <span>🕒 ${a.timestamp}</span>
            </div>
            
            <div style="margin-bottom: 12px;">
                <div style="font-size:12px; color:#cbd5e1; margin-bottom:6px;">指派现场处置单位：</div>
                <select id="dispatch-team" style="width:100%; padding:8px; background:#0f172a; color:#fff; border:1px solid #334155; border-radius:6px; outline:none; font-size:13px;">
                    <option>校区安保巡逻一组 (最近)</option>
                    <option>市局路政工程抢修队</option>
                    <option>辖区交警大队</option>
                    <option>校区后勤综合维修部</option>
                </select>
            </div>
            <div style="margin-bottom: 16px;">
                <div style="font-size:12px; color:#cbd5e1; margin-bottom:6px;">指挥中心处理意见/备注：</div>
                <textarea id="dispatch-notes" rows="3" style="width:100%; padding:8px; background:#0f172a; color:#fff; border:1px solid #334155; border-radius:6px; outline:none; resize:none; font-size:13px;" placeholder="请填写所需装备要求、封闭路段要求等详细信息..."></textarea>
            </div>

            <button class="g-btn primary" style="font-size:14px; padding:10px 0; border-radius:8px; box-shadow:0 4px 12px rgba(59,130,246,0.3);" onclick="submitProcessForm('${id}')">✅ 确认下发并归档</button>
        </div>
    `);
    setTimeout(() => window.anomalyPopup.show(), 500);
};

window.submitProcessForm = function(id) {
    const team = document.getElementById('dispatch-team').value;
    
    if (window.alertMarkersMap[id]) { window.map.removeOverlay(window.alertMarkersMap[id]); delete window.alertMarkersMap[id]; }
    window.activeAlerts = window.activeAlerts.filter(a => a.id !== id);
    window.anomalyPopup.hide();
    
    window.showToast(`工单已加密推送到 [${team}]，事件已归档！`, 4000);
    let badge = document.getElementById('event-badge');
    let currentCount = parseInt(badge.innerText || 0) - 1;
    badge.innerText = currentCount > 0 ? currentCount : 0;
    if (!document.getElementById('event-modal').classList.contains('collapsed')) window.openEventModal();
};

window.showAlertPopup = function(id) {
    let alertData = window.activeAlerts.find(a => a.id === id); if(!alertData) return;
    let marker = window.alertMarkersMap[id]; map.setViewport([marker._point], { zoomFactor: 19, enableAnimation: true });
    window.anomalyPopup.setPosition(marker._point); 
    window.anomalyPopup.setContent(`
        <div style="padding: 12px; background: #0f172a; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #38bdf8; font-weight: bold; font-size: 13px;">异常现场实拍记录</span>
            <div class="popup-close" onclick="closeAlertPopup()" style="position: static; font-size: 18px; cursor: pointer;">×</div>
        </div>
        <div style="padding: 12px; background: #1e293b;">
            <div style="font-weight: bold; color: #f8fafc; font-size: 15px; margin-bottom: 4px;">${alertData.title}</div>
            <div style="font-size: 12px; color:#94a3b8; margin-bottom: 10px;"> ${alertData.address}</div>
            <div style="width: 100%; height: 140px; background: #000 url('${alertData.img}') center/cover; border-radius: 8px; margin-bottom: 12px; border: 1px solid #334155; position:relative;">
                <div style="position:absolute; top:4px; right:4px; background:rgba(0,0,0,0.6); color:#fff; font-size:10px; padding:2px 4px; border-radius:4px;">AI 锁定标记</div>
            </div>
            <button class="g-btn primary" onclick="openProcessForm('${id}')">开启处理流程</button>
        </div>
    `);
    setTimeout(() => window.anomalyPopup.show(), 500);
};

// ==========================================
// 2. 百度地图 3D 初始化与底层组件
// ==========================================

window.onload = function() {
    if (window.__omniSpaReady && window.top === window) return;
    if (shouldUseVehicleAmap() && installVehicleAmapBMapShim()) {
        window.initBaiduMap();
        return;
    }
    var script = document.createElement("script"); script.type = "text/javascript";
    script.src = "https://api.map.baidu.com/api?type=webgl&v=1.0&ak=rrFX0pxXdSvW6bSu0xEgM0zqALAxSZ5l&callback=initBaiduMap";
    document.body.appendChild(script);
};

function installVehicleGisConsole(map) {
    if (window.__vehicleGisConsoleInstalled) return;
    window.__vehicleGisConsoleInstalled = true;
    window.vehicleGisDeferLaunch = true;
    window.vehicleGisLaunched = false;

    const root = document.createElement('aside');
    root.id = 'vehicle-gis-panel';
    root.className = 'vehicle-gis-panel';
    document.body.appendChild(root);

    const eventButton = document.createElement('button');
    eventButton.id = 'vehicle-gis-event-btn';
    eventButton.className = 'vehicle-gis-event-btn';
    eventButton.type = 'button';
    eventButton.innerHTML = '<span id="vehicle-gis-event-count">0</span><strong>事件处理</strong>';
    eventButton.addEventListener('click', () => window.openModule('event'));
    document.body.appendChild(eventButton);

    const boot = document.createElement('div');
    boot.id = 'vehicle-gis-boot';
    boot.className = 'vehicle-gis-boot';
    boot.innerHTML = `
        <div class="boot-core">
            <div class="boot-ring"></div>
            <h2>正在启动空地协同巡检</h2>
            <p>资源编队初始化 / 数据链路握手 / 3D 态势加载</p>
            <div class="boot-progress"><span></span></div>
        </div>`;
    document.body.appendChild(boot);

    const setPanel = html => { root.innerHTML = html; };
    const activeCount = () => (window.fleet || []).filter(drone => drone.isActive).length;
    const stationById = id => window.missionStations.find(station => station.id === id);
    const stationLoad = station => {
        const drone = window.fleet?.find(item => station.drones.includes(item.name));
        return drone?.isActive ? '执行中' : '待命';
    };
    const regionPlans = [
        {
            id: 'chengdu',
            name: '成都低空协同区',
            desc: '4 座任务站 / 城市路网巡检 / P2 标准',
            stations: ['s1', 's2', 's3', 's4'],
            center: [103.988, 30.765],
            color: '#00f0ff',
            path: [[103.72, 30.93], [104.18, 30.91], [104.26, 30.68], [104.04, 30.48], [103.66, 30.55], [103.72, 30.93]]
        },
        {
            id: 'mianyang',
            name: '绵阳北向保障区',
            desc: '2 座预置站 / 山前链路监测 / P3 常规',
            stations: ['s1', 's2'],
            center: [104.74, 31.46],
            color: '#23d08a',
            path: [[104.28, 31.76], [105.22, 31.70], [105.02, 31.18], [104.36, 31.16], [104.28, 31.76]]
        },
        {
            id: 'neijiang',
            name: '内江东南联络区',
            desc: '2 座联动站 / 交通走廊复核 / P2 标准',
            stations: ['s3', 's4'],
            center: [105.05, 29.59],
            color: '#f6b829',
            path: [[104.62, 29.92], [105.48, 29.84], [105.38, 29.20], [104.74, 29.24], [104.62, 29.92]]
        },
        {
            id: 'yaan',
            name: '雅安西部山地观测区',
            desc: '1 座临时站 / 山地气象感知 / P2 标准',
            stations: ['s2'],
            center: [103.00, 30.04],
            color: '#ff4c4c',
            path: [[102.48, 30.38], [103.38, 30.42], [103.28, 29.70], [102.62, 29.68], [102.48, 30.38]]
        }
    ];
    const regionById = id => regionPlans.find(region => region.id === id);
    window.vehicleGisSelectedRegion = regionPlans[0].id;

    window.setVehicleGisProvinceInteractive = function(enabled) {
        window.vehicleGisProvinceInteractive = !!enabled;
        if (!window.vehicleSichuanPolygon?.setOptions) return;
        window.vehicleSichuanPolygon.setOptions({
            strokeColor: enabled ? '#00f0ff' : 'rgba(0,240,255,0.35)',
            strokeOpacity: enabled ? 0.95 : 0.35,
            strokeWeight: enabled ? 2 : 1,
            fillOpacity: enabled ? 0.07 : 0.015,
            zIndex: enabled ? 18 : 2,
            bubble: true
        });
    };

    function renderOverview() {
        window.currentSelectedStation = null;
        window.vehicleGisPendingMission = null;
        window.vehicleGisLaunched = false;
        document.body.classList.remove('vehicle-gis-runtime');
        removeRuntimeUi();
        window.setVehicleGisProvinceInteractive(true);
        refreshRegionLayerStyles();
        setPanel(`
            <div class="vgis-title">空地协同态势总览</div>
            <div class="vgis-selected">
                <strong>四川省低空巡检网络</strong>
                <span>省域网格规划 / 区域任务站总览 / 点击地图分区查看详情</span>
            </div>
            <div class="vgis-metrics">
                <div><span>省域分区</span><strong>${regionPlans.length}</strong><small>块</small></div>
                <div><span>任务站总数</span><strong>${window.missionStations.length}</strong><small>座</small></div>
                <div><span>可用无人机</span><strong>${window.fleet?.length || 4}</strong><small>架</small></div>
                <div><span>链路健康度</span><strong>98</strong><small>%</small></div>
            </div>
            <div class="vgis-section-title">四川省分区态势</div>
            <div class="vgis-list">
                ${regionPlans.map(region => `<button class="vgis-station-card" type="button" data-region="${region.id}">
                    <strong>${region.name}</strong><span>${region.desc}</span><em>查看</em>
                </button>`).join('')}
            </div>
            <button class="vgis-primary" type="button" data-start-planning>开始巡检</button>
            <button class="vgis-secondary" type="button" data-open-sichuan>查看全省任务站</button>`);
        root.querySelectorAll('[data-region]').forEach(button => button.addEventListener('click', () => window.selectVehicleGisRegion(button.dataset.region)));
        root.querySelector('[data-start-planning]')?.addEventListener('click', () => window.startVehicleGisRuntime());
        root.querySelector('[data-open-sichuan]')?.addEventListener('click', () => window.selectVehicleGisProvince());
    }

    function renderProvinceStations(regionId = window.vehicleGisSelectedRegion) {
        window.currentSelectedStation = null;
        window.vehicleGisLaunched = false;
        document.body.classList.remove('vehicle-gis-runtime');
        removeRuntimeUi();
        window.setVehicleGisProvinceInteractive(true);
        const region = regionById(regionId) || regionPlans[0];
        window.vehicleGisSelectedRegion = region.id;
        refreshRegionLayerStyles();
        const stations = region.stations.map(stationById).filter(Boolean);
        setPanel(`
            <div class="vgis-title">${region.name}</div>
            <div class="vgis-selected">
                <strong>${region.desc}</strong>
                <span>规划态只展示站点概况；开始巡检后进入可操作地图界面。</span>
            </div>
            <div class="vgis-metrics">
                <div><span>覆盖站点</span><strong>${stations.length}</strong><small>座</small></div>
                <div><span>待命无人机</span><strong>${stations.length}</strong><small>架</small></div>
                <div><span>今日任务</span><strong>${region.id === 'chengdu' ? 9 : 4}</strong><small>单</small></div>
                <div><span>风险等级</span><strong>${region.id === 'yaan' ? 'P2' : 'P3'}</strong></div>
            </div>
            <div class="vgis-list station-list">
                ${stations.map(station => `
                    <div class="vgis-station-card is-readonly">
                        <strong>${station.name.trim()}</strong>
                        <span>${station.status} / ${station.drones.join('、')} / ${station.lng.toFixed(3)}, ${station.lat.toFixed(3)}</span>
                        <em>${stationLoad(station)}</em>
                    </div>`).join('')}
            </div>
            <button class="vgis-primary" type="button" data-start-planning>开始巡检</button>
            <button class="vgis-secondary" type="button" data-back-overview>返回总览</button>
            <button class="vgis-secondary" type="button" data-show-all>查看全省概况</button>`);
        root.querySelector('[data-start-planning]')?.addEventListener('click', () => window.startVehicleGisRuntime(region.id));
        root.querySelector('[data-back-overview]')?.addEventListener('click', renderOverview);
        root.querySelector('[data-show-all]')?.addEventListener('click', () => window.selectVehicleGisProvince());
    }

    function removeRuntimeUi() {
        document.getElementById('vehicle-gis-runtime-ui')?.remove();
        document.getElementById('vehicle-gis-runtime-alert')?.remove();
    }

    function refreshRegionLayerStyles() {
        (window.vehicleRegionPolygons || []).forEach(({ region, polygon }) => {
            const selected = !window.vehicleGisLaunched && window.vehicleGisSelectedRegion === region.id;
            polygon.setOptions({
                strokeColor: selected ? '#f6b829' : region.color,
                strokeOpacity: window.vehicleGisLaunched ? 0.25 : 0.9,
                strokeWeight: selected ? 4 : (window.vehicleGisLaunched ? 1 : 2),
                fillOpacity: selected ? 0.24 : (window.vehicleGisLaunched ? 0.025 : 0.10),
                zIndex: selected ? 26 : (window.vehicleGisLaunched ? 3 : 19),
                bubble: true
            });
        });
    }

    function renderRuntimeUi(region) {
        removeRuntimeUi();
        const runtime = document.createElement('section');
        runtime.id = 'vehicle-gis-runtime-ui';
        runtime.className = 'vehicle-gis-runtime-ui';
        runtime.innerHTML = `
            <div class="vehicle-runtime-left">
                <article class="vr-card">
                    <div class="vr-title">协同设备实时状态</div>
                    <div class="vr-metrics two">
                        <div><span>UAV 续航时间</span><strong>32</strong><small>min</small></div>
                        <div><span>机器人续航</span><strong>45</strong><small>min</small></div>
                    </div>
                    <div class="vr-chart line">
                        <span style="height:46%"></span><span style="height:60%"></span><span style="height:52%"></span><span style="height:72%"></span><span style="height:64%"></span><span style="height:82%"></span>
                    </div>
                </article>
                <article class="vr-card">
                    <div class="vr-title">巡检目标识别统计</div>
                    <div class="vr-metrics three">
                        <div><span>道路裂纹</span><strong>12</strong></div>
                        <div><span>异物侵限</span><strong class="warn">2</strong></div>
                        <div><span>站点异常</span><strong>0</strong></div>
                    </div>
                    <div class="vr-bars"><i style="height:42%"></i><i style="height:78%"></i><i style="height:62%"></i><i style="height:55%"></i><i style="height:90%"></i></div>
                </article>
                <article class="vr-card">
                    <div class="vr-title">环境感知单元</div>
                    <div class="vr-metrics two compact">
                        <div><span>点云采集频率</span><strong>25.0</strong><small>Hz</small></div>
                        <div><span>SLAM 漂移率</span><strong>0.02</strong><small>%</small></div>
                        <div><span>LiDAR 点云数</span><strong>30.2</strong><small>万/s</small></div>
                        <div><span>深度图延迟</span><strong>12.5</strong><small>ms</small></div>
                    </div>
                </article>
            </div>
            <div class="vehicle-runtime-right">
                <article class="vr-card">
                    <div class="vr-title">实时巡检任务流水</div>
                    <div class="vr-log"><b>13:05:22</b><span>UAV: 完成 K122 网格点扫描</span></div>
                    <div class="vr-log danger"><b>13:02:10</b><span>Robot: 检测到路面 0.5mm 裂纹</span></div>
                    <div class="vr-log"><b>12:58:45</b><span>System: LLM生成巡检简报并分发</span></div>
                    <div class="vr-log danger"><b>12:50:30</b><span>Robot: 机械臂清理轻质塑料异物完成</span></div>
                </article>
                <article class="vr-card">
                    <div class="vr-title">巡检覆盖率预测</div>
                    <div class="vr-chart area">
                        <span style="height:50%"></span><span style="height:56%"></span><span style="height:65%"></span><span style="height:82%"></span><span style="height:94%"></span>
                    </div>
                </article>
                <article class="vr-card mini-map">
                    <div class="vr-title">宏观路网站点分布</div>
                    <div class="vr-mini-map">
                        <span class="node n1">成都</span><span class="node n2">眉山</span><span class="node n3">K124巡检段</span><i></i>
                    </div>
                </article>
            </div>
            <div class="vehicle-runtime-bottom">
                <article class="vr-card">
                    <div class="vr-title">分级清障作业进度</div>
                    <div class="vr-progress"><span>小型异物</span><b style="width:85%"></b><em>85%</em></div>
                    <div class="vr-progress"><span>大型障碍</span><b style="width:100%"></b><em>100%</em></div>
                    <div class="vr-progress"><span>自主获取成功率</span><b style="width:86%"></b><em>24/28</em></div>
                </article>
                <article class="vr-card">
                    <div class="vr-title">通信与边缘算力状态</div>
                    <div class="vr-metrics four compact">
                        <div><span>5G 下行</span><strong>1.21</strong><small>Gbps</small></div>
                        <div><span>5G 上行</span><strong>340</strong><small>Mbps</small></div>
                        <div><span>边缘算力</span><strong>128</strong><small>TOPS</small></div>
                        <div><span>显存占用</span><strong class="warn">68</strong><small>%</small></div>
                    </div>
                    <div class="vr-progress load"><span>系统整体负载</span><b style="width:65%"></b><em>65%</em></div>
                </article>
            </div>`;
        document.body.appendChild(runtime);

        const alert = document.createElement('aside');
        alert.id = 'vehicle-gis-runtime-alert';
        alert.className = 'vehicle-gis-runtime-alert';
        alert.innerHTML = `
            <div class="alert-icon">!</div>
            <div>
                <strong>巡检无人机发现大型障碍物</strong>
                <span>${region.name} K124+180 附近识别到疑似障碍，请在地图绘制巡检路线或区域。</span>
            </div>`;
        document.body.appendChild(alert);
    }

    function renderRuntimeControlPanel(regionId = window.vehicleGisSelectedRegion) {
        const region = regionById(regionId) || regionPlans[0];
        const stations = region.stations.map(stationById).filter(Boolean);
        setPanel(`
            <div class="vgis-title">巡检运行控制</div>
            <div class="vgis-selected">
                <strong>${region.name}</strong>
                <span>运行态已启用，选择任务站后可使用原系统绘制路线、绘制区域、派发无人机功能。</span>
            </div>
            <div class="vgis-metrics">
                <div><span>执行无人机</span><strong>${activeCount()}</strong><small>架</small></div>
                <div><span>可派发站点</span><strong>${stations.length}</strong><small>座</small></div>
                <div><span>边缘节点</span><strong>8</strong><small>个</small></div>
                <div><span>识别精度</span><strong>99</strong><small>%</small></div>
            </div>
            <div class="vgis-section-title">任务站选择</div>
            <div class="vgis-list">
                ${stations.map(station => `<button class="vgis-station-card" type="button" data-runtime-station="${station.id}">
                    <strong>${station.name.trim()}</strong><span>${station.status} / ${station.drones.join('、')}</span><em>派发</em>
                </button>`).join('')}
            </div>
            <div class="vgis-section-title">巡检参数</div>
            <div class="vgis-metrics">
                <div><span>巡检模式</span><strong>低空视觉</strong></div>
                <div><span>默认高度</span><strong>120</strong><small>m</small></div>
                <div><span>任务优先级</span><strong>P2</strong></div>
                <div><span>回传策略</span><strong>实时</strong></div>
            </div>
            <div class="vgis-section-title">快捷控制</div>
            <div class="vgis-dispatch-grid">
                <button class="vgis-secondary" type="button" data-open-drone-panel>无人机信息</button>
                <button class="vgis-secondary" type="button" data-open-event-panel>事件处理</button>
                <button class="vgis-secondary" type="button" data-reset-view>回到区域视角</button>
                <button class="vgis-secondary" type="button" data-back-planning>返回规划态</button>
            </div>
            <div class="vgis-note ready">选择任务站后，可在地图上绘制巡逻路线或排查区域，再点击开始巡检派发无人机。</div>
            `);
        root.querySelectorAll('[data-runtime-station]').forEach(button => {
            button.addEventListener('click', () => window.selectVehicleGisStation(button.dataset.runtimeStation));
        });
        root.querySelector('[data-open-drone-panel]')?.addEventListener('click', () => window.renderVehicleGisDronePanel());
        root.querySelector('[data-open-event-panel]')?.addEventListener('click', () => window.openModule('event'));
        root.querySelector('[data-reset-view]')?.addEventListener('click', () => {
            if (map._amap && typeof AMap !== 'undefined') {
                map._amap.setZoomAndCenter(region.id === 'chengdu' ? 13.2 : 9.2, new AMap.LngLat(region.center[0], region.center[1]), false, 550);
            }
        });
        root.querySelector('[data-back-planning]')?.addEventListener('click', () => window.selectVehicleGisRegion(region.id));
    }

    window.startVehicleGisRuntime = function(regionId = window.vehicleGisSelectedRegion) {
        const region = regionById(regionId) || regionPlans[0];
        window.vehicleGisSelectedRegion = region.id;
        boot.classList.add('show');
        setTimeout(() => {
            boot.classList.remove('show');
            window.vehicleGisLaunched = true;
            window.currentSelectedStation = null;
            window.vehicleGisPendingMission = null;
        document.body.classList.add('vehicle-gis-runtime');
        window.setVehicleGisProvinceInteractive(false);
            refreshRegionLayerStyles();
            if (map._amap && typeof AMap !== 'undefined') {
                map._amap.setZoomAndCenter(region.id === 'chengdu' ? 13.2 : 9.2, new AMap.LngLat(region.center[0], region.center[1]), false, 700);
                map._amap.setPitch?.(48);
                map._amap.setRotation?.(-18);
            }
            renderRuntimeUi(region);
            renderRuntimeControlPanel(region.id);
            window.showToast('已进入空地协同运行态，可选择任务站并绘制巡检路线。', 2800);
        }, 2100);
    };

    window.renderVehicleGisDispatchPanel = function(stationId) {
        const station = stationById(stationId || window.currentSelectedStation);
        if (!station) {
            if (window.vehicleGisLaunched) return renderRuntimeControlPanel();
            return renderOverview();
        }
        window.setVehicleGisProvinceInteractive(false);
        const pending = window.vehicleGisPendingMission;
        setPanel(`
            <div class="vgis-title">巡逻任务派发</div>
            <div class="vgis-selected">
                <strong>${station.name.trim()}</strong>
                <span>${station.status} / 经度 ${station.lng.toFixed(4)} / 纬度 ${station.lat.toFixed(4)}</span>
            </div>
            <div class="vgis-section-title">可用设备</div>
            <div class="vgis-list">
                ${station.drones.map(name => {
                    const drone = window.fleet?.find(item => item.name === name);
                    return `<div class="vgis-row"><strong>${name}</strong><span>${drone?.isActive ? '任务执行中' : '待命可派发'}</span></div>`;
                }).join('')}
            </div>
            <div class="vgis-dispatch-grid">
                <button class="vgis-secondary" type="button" data-draw-route>绘制巡逻路线</button>
                <button class="vgis-secondary" type="button" data-draw-area>绘制排查区域</button>
            </div>
            <div class="vgis-note ${pending ? 'ready' : ''}">
                ${pending ? `已生成${pending.type === 'area' ? '排查区域' : '巡逻路线'}，可启动巡检。` : '请先在地图上绘制巡逻路线或排查区域。'}
            </div>
            <button class="vgis-primary" type="button" data-launch-mission ${pending ? '' : 'disabled'}>开始巡检</button>
            <button class="vgis-secondary" type="button" data-back-stations>返回任务站列表</button>
            <button class="vgis-secondary" type="button" data-open-drone-panel>无人机信息</button>`);
        root.querySelector('[data-draw-route]')?.addEventListener('click', () => {
            window.vehicleGisDeferLaunch = true;
            window.startDispatchDraw('route');
        });
        root.querySelector('[data-draw-area]')?.addEventListener('click', () => {
            window.vehicleGisDeferLaunch = true;
            window.startDispatchDraw('area');
        });
        root.querySelector('[data-launch-mission]')?.addEventListener('click', window.launchVehicleGisPendingMission);
        root.querySelector('[data-back-stations]')?.addEventListener('click', () => {
            if (window.vehicleGisLaunched) renderRuntimeControlPanel();
            else renderProvinceStations();
        });
        root.querySelector('[data-open-drone-panel]')?.addEventListener('click', () => window.renderVehicleGisDronePanel());
    };

    window.renderVehicleGisDronePanel = function() {
        if (!window.vehicleGisLaunched && !window.currentSelectedStation && !window.drawState?.active) {
            window.setVehicleGisProvinceInteractive(true);
        }
        const activeDrones = (window.fleet || []).map((drone, index) => ({ drone, index })).filter(item => item.drone.isActive);
        setPanel(`
            <div class="vgis-title">无人机信息</div>
            <div class="vgis-selected">
                <strong>任务中无人机 ${activeDrones.length} 架</strong>
                <span>集合原系统无人机详情、返航、航线微调功能</span>
            </div>
            <div class="vgis-list">
                ${activeDrones.length ? activeDrones.map(({ drone, index }) => `
                    <button class="vgis-station-card" type="button" data-drone-index="${index}">
                        <strong>${drone.name}</strong>
                        <span>${drone.missionState === 'returning' ? '返航中' : (drone.patrolMode === 'area' ? '区域排查' : '沿线巡逻')} / 15m/s</span>
                        <em>查看</em>
                    </button>`).join('') : '<div class="vgis-empty">当前暂无执行中无人机，请先派发巡检任务。</div>'}
            </div>
            <button class="vgis-secondary" type="button" data-back-overview>${window.vehicleGisLaunched ? '返回运行控制' : '返回总览'}</button>`);
        root.querySelectorAll('[data-drone-index]').forEach(button => button.addEventListener('click', () => window.openDroneDetail(Number(button.dataset.droneIndex))));
        root.querySelector('[data-back-overview]')?.addEventListener('click', () => {
            if (window.vehicleGisLaunched) renderRuntimeControlPanel();
            else renderOverview();
        });
    };

    window.selectVehicleGisProvince = function() {
        if (window.vehicleGisProvinceInteractive === false || window.currentSelectedStation || window.drawState?.active) return;
        if (window.vehicleSichuanPolygon?.setOptions) {
            window.vehicleSichuanPolygon.setOptions({
                strokeColor: '#f6b829',
                fillOpacity: 0.22,
                strokeWeight: 3
            });
        }
        renderOverview();
    };

    window.selectVehicleGisRegion = function(regionId) {
        const region = regionById(regionId);
        if (!region) return;
        window.vehicleGisSelectedRegion = region.id;
        if (map._amap && typeof AMap !== 'undefined') {
            map._amap.setZoomAndCenter(8.4, new AMap.LngLat(region.center[0], region.center[1]), false, 650);
        }
        (window.vehicleRegionPolygons || []).forEach(({ region: item, polygon }) => {
            polygon.setOptions({
                strokeColor: item.id === region.id ? '#f6b829' : item.color,
                strokeWeight: item.id === region.id ? 4 : 2,
                fillOpacity: item.id === region.id ? 0.24 : 0.10,
                zIndex: item.id === region.id ? 26 : 19,
                bubble: true
            });
        });
        renderProvinceStations(region.id);
    };

    window.selectVehicleGisStation = function(stationId) {
        if (!window.vehicleGisLaunched) {
            window.showToast('请先点击“开始巡检”进入运行态，再选择具体任务站。', 2600);
            return;
        }
        const station = stationById(stationId);
        if (!station) return;
        window.currentSelectedStation = stationId;
        window.vehicleGisPendingMission = null;
        window.setVehicleGisProvinceInteractive(false);
        map.setViewport([new BMapGL.Point(station.lng, station.lat)], { zoomFactor: 17.8, enableAnimation: true });
        window.renderVehicleGisDispatchPanel(stationId);
    };

    function installSichuanLayer() {
        if (!map._amap || typeof AMap === 'undefined') return;
        const sichuan = [
            [97.35, 34.28], [99.40, 33.15], [101.12, 33.58], [103.36, 32.74],
            [105.78, 32.56], [107.20, 31.32], [106.92, 29.30], [105.62, 28.15],
            [103.45, 27.34], [101.62, 26.08], [99.04, 27.10], [97.70, 28.72],
            [97.12, 30.60], [97.35, 34.28]
        ].map(([lng, lat]) => new AMap.LngLat(lng, lat));
        const polygon = new AMap.Polygon({
            path: sichuan,
            strokeColor: '#00f0ff',
            strokeOpacity: 0.95,
            strokeWeight: 2,
            fillColor: '#00f0ff',
            fillOpacity: 0.07,
            zIndex: 18,
            bubble: true
        });
        polygon.on('mouseover', () => {
            if (window.vehicleGisProvinceInteractive === false || window.currentSelectedStation || window.drawState?.active) return;
            polygon.setOptions({ strokeColor: '#f6b829', strokeWeight: 4, fillOpacity: 0.20, zIndex: 18, bubble: true });
        });
        polygon.on('mouseout', () => {
            if (window.vehicleGisProvinceInteractive === false || window.currentSelectedStation || window.drawState?.active) return;
            polygon.setOptions({ strokeColor: '#00f0ff', strokeWeight: 2, fillOpacity: 0.07, zIndex: 18, bubble: true });
        });
        polygon.on('click', window.selectVehicleGisProvince);
        map._amap.add(polygon);
        window.vehicleSichuanPolygon = polygon;
        window.setVehicleGisProvinceInteractive(true);
    }

    function installRegionLayers() {
        if (!map._amap || typeof AMap === 'undefined') return;
        window.vehicleRegionPolygons = regionPlans.map(region => {
            const polygon = new AMap.Polygon({
                path: region.path.map(([lng, lat]) => new AMap.LngLat(lng, lat)),
                strokeColor: region.color,
                strokeOpacity: 0.9,
                strokeWeight: 2,
                fillColor: region.color,
                fillOpacity: 0.10,
                zIndex: 19,
                bubble: true
            });
            const reset = () => {
                if (!window.vehicleGisLaunched && window.vehicleGisSelectedRegion === region.id) {
                    polygon.setOptions({ strokeColor: '#f6b829', strokeWeight: 4, fillOpacity: 0.24, zIndex: 26, bubble: true });
                    return;
                }
                polygon.setOptions({
                    strokeColor: region.color,
                    strokeOpacity: window.vehicleGisLaunched ? 0.25 : 0.9,
                    strokeWeight: window.vehicleGisLaunched ? 1 : 2,
                    fillOpacity: window.vehicleGisLaunched ? 0.025 : 0.10,
                    zIndex: window.vehicleGisLaunched ? 3 : 19,
                    bubble: true
                });
            };
            polygon.on('mouseover', () => {
                if (window.vehicleGisLaunched || window.currentSelectedStation || window.drawState?.active) return;
                polygon.setOptions({ strokeColor: '#f6b829', strokeWeight: 4, fillOpacity: 0.26, zIndex: 28, bubble: true });
            });
            polygon.on('mouseout', reset);
            polygon.on('click', () => {
                if (window.vehicleGisLaunched || window.currentSelectedStation || window.drawState?.active) return;
                window.selectVehicleGisRegion(region.id);
            });
            map._amap.add(polygon);
            return { region, polygon };
        });
    }

    installSichuanLayer();
    installRegionLayers();
    renderOverview();
}

window.initBaiduMap = function() {
    var map = new BMapGL.Map("map"); window.map = map;
    
    // 🚨 核心改动：设置初始高倍数(17.0)和大俯仰角(70)，并强制开启 3D 建筑渲染
    map.centerAndZoom(new BMapGL.Point(103.9850, 30.7650), 17.0); 
    map.enableScrollWheelZoom(true); 
    map.setTilt(70); 
    map.setHeading(20); 
    map.setDisplayOptions({ building: true, poi: true }); // 强制开启建筑渲染
    
    map.addEventListener('click', function(e) { if(window.mapClickListener) window.mapClickListener(e); });
    map.addEventListener('mousemove', function(e) { if(window.mapMouseMoveListener) window.mapMouseMoveListener(e); });

    fetch('./classiconly.json').then(res => res.json()).then(data => { map.setMapStyleV2({ styleJson: data }); }).catch(e=>{});

    function StationOverlay(point, name, id) { this._point = point; this._name = name; this._id = id; }
    StationOverlay.prototype = new BMapGL.Overlay();
    StationOverlay.prototype.initialize = function(map) {
        var div = document.createElement("div"); div.className = "station-marker";
        div.innerHTML = `<div class="station-icon">🏢</div><div class="station-name">${this._name}</div>`;
        div.onclick = (e) => { e.stopPropagation(); openModule('dispatch'); window.openStationDetail(this._id); };
        div.innerHTML = `<span class="station-dot-core"></span><span class="station-name">${this._name}</span>`;
        div.onclick = (e) => {
            e.stopPropagation();
            if (typeof window.selectVehicleGisStation === 'function') {
                window.selectVehicleGisStation(this._id);
                return;
            }
            openModule('dispatch');
            window.openStationDetail(this._id);
        };
        map.getPanes().labelPane.appendChild(div); this._div = div; return div;
    };
    StationOverlay.prototype.draw = function() { var p = window.map.pointToOverlayPixel(this._point); if (p) { this._div.style.left = p.x + "px"; this._div.style.top = p.y + "px"; } };

    window.missionStations.forEach(station => { map.addOverlay(new StationOverlay(new BMapGL.Point(station.lng, station.lat), station.name, station.id)); });

    function EffectOverlay(point, cssClass, innerText) { this._point = point; this._cssClass = cssClass; this._innerText = innerText || ''; this._heading = 0; }
    EffectOverlay.prototype = new BMapGL.Overlay();
    EffectOverlay.prototype.initialize = function(map) {
        var div = document.createElement("div"); div.className = this._cssClass;
        if (this._cssClass.includes('radar-dot')) { div.innerHTML = `<span style="position:relative; z-index:2;">${this._innerText}</span><div class="radar-heading-container"><div class="radar-heading-arrow"></div></div>`; } 
        else { div.innerText = this._innerText; }
        map.getPanes().labelPane.appendChild(div); this._div = div; return div;
    };
    EffectOverlay.prototype.draw = function() {
        var pixel = window.map.pointToOverlayPixel(this._point); if (!pixel) return; 
        var size = this._cssClass.includes('aura-ring') ? 40 : 20;
        this._div.style.left = pixel.x - (size/2) + "px"; this._div.style.top = pixel.y - (size/2) + "px";
        if (this._cssClass.includes('radar-dot') && this._div.querySelector('.radar-heading-container')) { this._div.querySelector('.radar-heading-container').style.transform = `rotate(${this._heading}deg)`; }
    };
    EffectOverlay.prototype.setPosition = function(point) { this._point = point; this.draw(); }
    EffectOverlay.prototype.setHeading = function(angle) { this._heading = angle; this.draw(); }
    EffectOverlay.prototype.hide = function() { if (this._div) this._div.style.display = "none"; }
    EffectOverlay.prototype.show = function() { if (this._div) this._div.style.display = ""; }

    function DroneModelOverlay(point, glbUrl) { this._point = point; this._glbUrl = glbUrl; }
    DroneModelOverlay.prototype = new BMapGL.Overlay();
    DroneModelOverlay.prototype.initialize = function(map) {
        var div = document.createElement("div"); div.className = "drone-model-container";
        div.innerHTML = `<div class="drone-floater"><model-viewer src="${this._glbUrl}" orientation="0deg 0deg 90deg" camera-orbit="0deg 60deg 105%" environment-image="neutral" shadow-intensity="1" style="width: 100%; height: 100%; background-color: transparent;"></model-viewer></div>`;
        map.getPanes().labelPane.appendChild(div); this._div = div; return div;
    };
    DroneModelOverlay.prototype.draw = function() { var pixel = window.map.pointToOverlayPixel(this._point); if (!pixel) return; this._div.style.left = pixel.x + "px"; this._div.style.top = pixel.y + "px"; };
    DroneModelOverlay.prototype.setHeading = function(angle) {
        var viewer = this._div.querySelector('model-viewer');
        if (viewer) { var mapHeading = map.getHeading() || 0; var mapTilt = map.getTilt() || 0; viewer.setAttribute('camera-orbit', `${-(angle - mapHeading)}deg ${mapTilt}deg 105%`); }
    };
    DroneModelOverlay.prototype.setPosition = function(point) { this._point = point; this.draw(); }
    DroneModelOverlay.prototype.hide = function() { if(this._div) this._div.style.display = "none"; }
    DroneModelOverlay.prototype.show = function() { if(this._div) this._div.style.display = "block"; }

    // 🚨 核心修复：将自定义覆盖物类挂载到全局 window，让拖拽引擎可以访问到
    window.AlertMarkerOverlay = function(point, severity, id) { this._point = point; this._severity = severity; this._id = id; };
    window.AlertMarkerOverlay.prototype = new BMapGL.Overlay();
    window.AlertMarkerOverlay.prototype.initialize = function(map) {
        var container = document.createElement("div"); container.className = "alert-marker-container " + this._severity;
        container.style.display = "none"; container.style.cursor = "pointer";
        container.innerHTML = `<div class="alert-radius"></div><div class="alert-core-dot"></div>`;
        container.onclick = (e) => { e.stopPropagation(); window.showAlertPopup(this._id); };
        map.getPanes().labelPane.appendChild(container); this._div = container; return container;
    };
    window.AlertMarkerOverlay.prototype.draw = function() { var p = window.map.pointToOverlayPixel(this._point); if(p) { this._div.style.left = p.x + "px"; this._div.style.top = p.y + "px"; this._div.style.transform = "translate(-50%, -50%)"; } };
    window.AlertMarkerOverlay.prototype.show = function() { if (this._div) this._div.style.display = "flex"; };
    window.AlertMarkerOverlay.prototype.hide = function() { if (this._div) this._div.style.display = "none"; };

    function AlertPopupOverlay(point) { this._point = point; }
    AlertPopupOverlay.prototype = new BMapGL.Overlay();
    AlertPopupOverlay.prototype.initialize = function(map) { var div = document.createElement("div"); div.className = "custom-popup"; div.style.display = "none"; map.getPanes().labelPane.appendChild(div); this._div = div; return div; };
    AlertPopupOverlay.prototype.draw = function() { var p = window.map.pointToOverlayPixel(this._point); if(p) { this._div.style.left = p.x + "px"; this._div.style.top = p.y + "px"; } };
    AlertPopupOverlay.prototype.setContent = function(html) { this._div.innerHTML = html; };
    AlertPopupOverlay.prototype.setPosition = function(point) { this._point = point; this.draw(); };
    AlertPopupOverlay.prototype.show = function() { if (this._div) this._div.style.display = "block"; };
    AlertPopupOverlay.prototype.hide = function() { if (this._div) this._div.style.display = "none"; };

    window.anomalyPopup = new AlertPopupOverlay(new BMapGL.Point(0,0)); map.addOverlay(window.anomalyPopup);

    window.fleet = [
        { name: "无人机1号", isActive: false, speed: 0.001, progress: 0, pathIdx: 0, direction: 1, missionState: 'idle' },
        { name: "无人机2号", isActive: false, speed: 0.001, progress: 0, pathIdx: 0, direction: 1, missionState: 'idle' },
        { name: "无人机3号", isActive: false, speed: 0.001, progress: 0, pathIdx: 0, direction: 1, missionState: 'idle' },
        { name: "无人机4号", isActive: false, speed: 0.001, progress: 0, pathIdx: 0, direction: 1, missionState: 'idle' }
    ];

    window.fleet.forEach((drone, idx) => {
        drone.currentPoint = new BMapGL.Point(103.985, 30.765);
        let rClass = 'radar-dot ' + ['radar-alpha','radar-beta','radar-gamma','radar-delta'][idx];
        let rText = ['A','B','G','D'][idx];
        drone.overlays = {
            radarDot: new EffectOverlay(drone.currentPoint, rClass, rText),
            auraRing: new EffectOverlay(drone.currentPoint, 'aura-ring'),
            droneModel: new DroneModelOverlay(drone.currentPoint, './assets/models/drone.glb')
        };
        let safeDummyPoint = new BMapGL.Point(drone.currentPoint.lng + 0.0001, drone.currentPoint.lat + 0.0001);
        drone.movementLine = new BMapGL.Polyline([drone.currentPoint, safeDummyPoint], { strokeColor: "#10b981", strokeWeight: 3, strokeOpacity: 0.8, strokeStyle: "dashed" });
        map.addOverlay(drone.movementLine); drone.movementLine.hide();
        
        map.addOverlay(drone.overlays.radarDot); map.addOverlay(drone.overlays.auraRing); map.addOverlay(drone.overlays.droneModel);
    });

    installVehicleGisConsole(map);

    window.updateLOD = function() {
        var zoom = map.getZoom();
        window.fleet.forEach(drone => {
            if (!drone.isActive) {
                drone.overlays.radarDot.hide(); drone.overlays.auraRing.hide(); drone.overlays.droneModel.hide(); 
                if (drone.activeOverlay) drone.activeOverlay.hide();
                if (drone.movementLine) drone.movementLine.hide();
                return; 
            }
            if (drone.activeOverlay) drone.activeOverlay.show();

            if (zoom < 15) { 
                drone.overlays.radarDot.hide(); drone.overlays.auraRing.hide(); drone.overlays.droneModel.hide(); 
                if (drone.movementLine) drone.movementLine.hide();
            } else if (zoom >= 15 && zoom < 18) { 
                drone.overlays.droneModel.hide(); drone.overlays.radarDot.show(); drone.overlays.auraRing.show(); 
                if (drone.missionState === 'deploying' || drone.missionState === 'returning') drone.movementLine.show();
            } else { 
                drone.overlays.radarDot.hide(); drone.overlays.auraRing.show(); drone.overlays.droneModel.show(); 
                if (drone.missionState === 'deploying' || drone.missionState === 'returning') drone.movementLine.show();
            }
        });
    };
    
    map.addEventListener('zoomend', window.updateLOD); setTimeout(window.updateLOD, 200);

    function animateFlight() {
        window.fleet.forEach((drone, index) => {
            // 微调模式时无人机悬停
            if (drone.missionState === 'editing') return;

            if (!drone.isActive || !drone.currentMovementPath || drone.currentMovementPath.length < 2) return; 

            let p1 = drone.currentMovementPath[drone.pathIdx];
            let p2 = drone.currentMovementPath[drone.pathIdx + drone.direction];

            if (!p1 || !p2) { 
                if (drone.missionState === 'patrolling' && drone.patrolMode === 'route') {
                    drone.direction *= -1; 
                    p2 = drone.currentMovementPath[drone.pathIdx + drone.direction];
                } else { return; }
            }

            drone.progress += drone.speed;
            
            if (drone.progress >= 1) {
                if (drone.missionState === 'deploying' && drone.pathIdx >= drone.currentMovementPath.length - 2) {
                    drone.movementLine.hide(); drone.missionState = 'patrolling';
                    if (drone.patrolMode === 'route') {
                        drone.currentMovementPath = drone.targetPath; drone.pathIdx = 0; drone.progress = 0; drone.direction = 1;
                    } else if (drone.patrolMode === 'area') {
                        drone.currentMovementPath = [drone.currentPoint, new BMapGL.Point(
                            drone.patrolBounds.minLng + Math.random() * (drone.patrolBounds.maxLng - drone.patrolBounds.minLng),
                            drone.patrolBounds.minLat + Math.random() * (drone.patrolBounds.maxLat - drone.patrolBounds.minLat)
                        )];
                        drone.pathIdx = 0; drone.progress = 0; drone.direction = 1;
                    }
                    if (window.focusedDroneIndex === index) openModule('drone');
                    return;
                } 
                else if (drone.missionState === 'returning' && drone.pathIdx >= drone.currentMovementPath.length - 2) {
                    drone.movementLine.hide(); drone.isActive = false; drone.missionState = 'idle';
                    window.updateLOD(); window.showToast(`✅ ${drone.name} 已安全降落入库。`);
                    if (window.focusedDroneIndex === index) closeDrawer('right');
                    return;
                }
                else {
                    if (drone.missionState === 'patrolling' && drone.patrolMode === 'area') {
                        drone.currentMovementPath = [drone.currentPoint, new BMapGL.Point(
                            drone.patrolBounds.minLng + Math.random() * (drone.patrolBounds.maxLng - drone.patrolBounds.minLng),
                            drone.patrolBounds.minLat + Math.random() * (drone.patrolBounds.maxLat - drone.patrolBounds.minLat)
                        )];
                        drone.pathIdx = 0; drone.progress = 0; drone.direction = 1; return;
                    } else {
                        drone.progress = 0; drone.pathIdx += drone.direction;
                        if (drone.pathIdx >= drone.currentMovementPath.length - 1 || drone.pathIdx <= 0) drone.direction *= -1;
                    }
                }
            }

            let curLng = p1.lng + (p2.lng - p1.lng) * drone.progress; let curLat = p1.lat + (p2.lat - p1.lat) * drone.progress;
            drone.currentPoint = new BMapGL.Point(curLng, curLat);
            let dx = (p2.lng - p1.lng) * Math.cos(p1.lat * Math.PI / 180); let dy = p2.lat - p1.lat;
            drone.currentHeading = Math.atan2(dx, dy) * 180 / Math.PI;

            if (drone.missionState === 'deploying' && drone.targetPath && drone.targetPath[0]) {
                let targetPt = drone.targetPath[0];
                if (Math.abs(drone.currentPoint.lng - targetPt.lng) < 0.00001 && Math.abs(drone.currentPoint.lat - targetPt.lat) < 0.00001) targetPt = new BMapGL.Point(targetPt.lng + 0.00001, targetPt.lat + 0.00001);
                drone.movementLine.setPath([drone.currentPoint, targetPt]);
            } else if (drone.missionState === 'returning' && drone.homePoint) {
                let targetPt = drone.homePoint;
                if (Math.abs(drone.currentPoint.lng - targetPt.lng) < 0.00001 && Math.abs(drone.currentPoint.lat - targetPt.lat) < 0.00001) targetPt = new BMapGL.Point(targetPt.lng + 0.00001, targetPt.lat + 0.00001);
                drone.movementLine.setPath([drone.currentPoint, targetPt]);
            }

            drone.overlays.radarDot.setPosition(drone.currentPoint); drone.overlays.radarDot.setHeading(drone.currentHeading);
            drone.overlays.auraRing.setPosition(drone.currentPoint);
            drone.overlays.droneModel.setPosition(drone.currentPoint); drone.overlays.droneModel.setHeading(drone.currentHeading);

            if (window.focusedDroneIndex === index && window.isChaseMode) { 
                map.setCenter(drone.currentPoint); map.setHeading(drone.currentHeading); 
            }

            if (drone.missionState === 'patrolling' && !isMapEventDetectionPaused()) {
                if (!drone.lastDetectTime) drone.lastDetectTime = 0;
                let now = Date.now();
                if (now - drone.lastDetectTime > 6000 && Math.random() < 0.0008 && window.activeAlerts.length < 30) {
                    let isTooClose = window.activeAlerts.some(a => {
                        let dLng = drone.currentPoint.lng - a.point.lng; let dLat = drone.currentPoint.lat - a.point.lat;
                        return Math.sqrt(dLng*dLng + dLat*dLat) < 0.0015;
                    });
                    if (!isTooClose) {
                        drone.lastDetectTime = now; 
                        let alertId = 'alert_' + Date.now() + Math.floor(Math.random()*1000);
                        let template = window.alertLibrary[Math.floor(Math.random() * window.alertLibrary.length)]; 
                        let mockAddr = window.mockAddressPool[Math.floor(Math.random() * window.mockAddressPool.length)] + ' ' + (Math.floor(Math.random() * 300) + 1) + '号';
                        
                        let newAlert = {
                            id: alertId,
                            point: new BMapGL.Point(drone.currentPoint.lng, drone.currentPoint.lat), 
                            severity: template.severity, title: template.title, img: template.img,
                            timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
                            droneName: drone.name, address: mockAddr 
                        };

                        window.activeAlerts.push(newAlert);
                        let marker = new AlertMarkerOverlay(newAlert.point, newAlert.severity, newAlert.id);
                        window.map.addOverlay(marker); window.alertMarkersMap[newAlert.id] = marker; marker.show();

                        window.showToast(` ${drone.name} 发现异常现场：${newAlert.title}`, 4500);
                        let badge = document.getElementById('event-badge'); badge.innerText = parseInt(badge.innerText || 0) + 1;
                        const vehicleBadge = document.getElementById('vehicle-gis-event-count');
                        if (vehicleBadge) vehicleBadge.innerText = badge.innerText;
                        if (!document.getElementById('event-modal').classList.contains('collapsed')) window.openEventModal();
                    }
                }
            }
        });
        requestAnimationFrame(animateFlight);
    }
    animateFlight();

    window.showToast = function(msg, dur = 3000) { let t = document.getElementById('sys-toast'); t.innerText = msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), dur); };
    window.closeAlertPopup = function() { window.anomalyPopup.hide(); };
    window.enterChaseCamera = function(e) {
        if(e) { e.stopPropagation(); e.preventDefault(); }
        window.isChaseMode = true; map.setTilt(80); map.setZoom(20);
        window.showToast("视角已锁定至无人机尾随状态。拖拽地图即可退出。", 5000);
    };
    map.addEventListener('dragstart', () => window.isChaseMode = false);
};

document.addEventListener('DOMContentLoaded', () => {
    bindNavTabs();
    bindSearch();
    bindDroneItems();
    initFlowChart();
    
    bindEventScrollPause(); 

    injectExportButton(); // 🚨 新增：在页面加载时动态注入导出按钮

    updateDashboardData('drone_01');
});

// 调大模拟间隔时间以配合 CSS transition，使得过渡丝滑
// ================= 实时车辆检测数模拟配置（分离 4 个设备） =================

// 无人机 01 号 - 繁华市区主干道（小轿车、公交车较多，车流量极大）
const configDrone01 = {
    intervalMs: 2000, // 3秒刷新一次，配合 CSS 动画极其丝滑
    vehicles: {
        bus:     { min: 5,  max: 30,  start: 12, stepMax: 3 },
        car:     { min: 40, max: 120, start: 85, stepMax: 8 },
        freight: { min: 0,  max: 12,  start: 5,  stepMax: 2 },
        truck:   { min: 0,  max: 8,   start: 3,  stepMax: 1 },
        van:     { min: 5,  max: 30,  start: 16, stepMax: 3 }
    }
};

// 无人机 02 号 - 工业区/物流园周边（货车、卡车显著增多）
const configDrone02 = {
    intervalMs: 2000,
    vehicles: {
        bus:     { min: 0,  max: 10, start: 2,  stepMax: 1 },
        car:     { min: 10, max: 50, start: 25, stepMax: 4 },
        freight: { min: 10, max: 40, start: 22, stepMax: 5 },
        truck:   { min: 5,  max: 35, start: 18, stepMax: 4 },
        van:     { min: 5,  max: 25, start: 12, stepMax: 2 }
    }
};

// 无人机 03 号 - 郊区/城乡结合部（整体车流平稳，面包车较多）
const configDrone03 = {
    intervalMs: 2000,
    vehicles: {
        bus:     { min: 0,  max: 8,  start: 3,  stepMax: 1 },
        car:     { min: 15, max: 60, start: 30, stepMax: 5 },
        freight: { min: 2,  max: 15, start: 8,  stepMax: 2 },
        truck:   { min: 0,  max: 10, start: 4,  stepMax: 1 },
        van:     { min: 10, max: 45, start: 25, stepMax: 4 }
    }
};

// 无人机 04 号 - 高速公路/快速路段（小轿车和物流重卡极多，车速快基数大）
const configDrone04 = {
    intervalMs: 2000,
    vehicles: {
        bus:     { min: 2,  max: 15,  start: 6,  stepMax: 2 },
        car:     { min: 50, max: 150, start: 95, stepMax: 10 },
        freight: { min: 5,  max: 25,  start: 14, stepMax: 3 },
        truck:   { min: 10, max: 45,  start: 28, stepMax: 5 },
        van:     { min: 2,  max: 20,  start: 8,  stepMax: 2 }
    }
};

// 默认兜底配置（防止传入未知的 droneId 时报错）
const defaultSimulationConfig = configDrone01;

// 将各个设备的配置绑定到字典中
const droneSimulationConfigs = {
    drone_01: configDrone01,
    drone_02: configDrone02,
    drone_03: configDrone03,
    drone_04: configDrone04
};

const vehicleKeyToElementId = {
    bus: 'count-bus', car: 'count-car', freight: 'count-freight', truck: 'count-truck', van: 'count-van'
};

const vehicleSeriesMeta = {
    bus: { label: '公交车', color: '#38bdf8' },
    car: { label: '小轿车', color: '#22c55e' },
    freight: { label: '货车', color: '#f59e0b' },
    truck: { label: '卡车', color: '#ef4444' },
    van: { label: '面包车', color: '#a78bfa' }
};

const flowChartConfig = {
    totalPoints: 24,
    anchorIndex: 6,
    pastDurationSeconds: 3600,
    futureDurationSeconds: 10800
};

let simulationTimer = null;
let currentCounts = {};
let currentDroneId = 'drone_01';

// 图表持久化 DOM 变量
let flowChartContainer = null;
let lastSvgWidth = 0;
let lastSvgHeight = 0;
const flowHistoryByDrone = {};
const fallbackAnchorByDrone = {};

function bindNavTabs() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        });
    });
}

function bindSearch() {
    const searchInput = document.getElementById('droneSearch');
    searchInput.addEventListener('input', () => {
        const searchText = searchInput.value.toLowerCase();
        const droneItems = document.querySelectorAll('.drone-item');
        const noResultsDiv = document.getElementById('no-results');
        let hasVisibleItem = false; 

        droneItems.forEach(item => {
            const droneName = item.querySelector('.drone-name').textContent.toLowerCase();
            if (droneName.includes(searchText)) {
                item.style.display = ''; 
                hasVisibleItem = true;
            } else {
                item.style.display = 'none'; 
            }
        });

        noResultsDiv.style.display = hasVisibleItem ? 'none' : 'block';
    });
}

function bindDroneItems() {
    const droneItems = document.querySelectorAll('.drone-item');
    droneItems.forEach(item => {
        item.addEventListener('click', () => {
            const id = item.getAttribute('data-id');
            const name = item.getAttribute('data-name');

            if (id === 'job_overview') {
                document.querySelectorAll('.drone-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                document.querySelector('.data-section')?.classList.add('overview-mode');
                const titleEl = document.getElementById('current-drone-title');
                if (titleEl) titleEl.textContent = '作业总览 - 全域任务态势';
                stopRealtimeSimulation();
                return;
            }

            if (item.querySelector('.status-dot')?.classList.contains('offline')) {
                alert('该无人机当前离线，无法获取实时数据！');
                return;
            }

            document.querySelectorAll('.drone-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            document.querySelector('.data-section')?.classList.remove('overview-mode');
            
            const titleEl = document.getElementById('current-drone-title');
            if (titleEl) titleEl.textContent = `${name} - 道路信息分析`;

            updateDashboardData(id);
        });
    });
}

function updateDashboardData(droneId) {
    currentDroneId = droneId;
    startRealtimeSimulation(droneId);
}

function startRealtimeSimulation(droneId) {
    stopRealtimeSimulation();
    const config = droneSimulationConfigs[droneId] || defaultSimulationConfig;
    currentCounts = buildStartCounts(config);

    renderVehicleCounts(currentCounts);
    updateFlowChart(currentCounts, droneId, config);

    simulationTimer = setInterval(() => {
        currentCounts = getNextCounts(currentCounts, config);
        renderVehicleCounts(currentCounts);
        updateFlowChart(currentCounts, droneId, config);
    }, config.intervalMs);
}

function stopRealtimeSimulation() {
    if (simulationTimer) {
        clearInterval(simulationTimer);
        simulationTimer = null;
    }
}

function buildStartCounts(config) {
    const counts = {};
    Object.keys(config.vehicles).forEach(key => counts[key] = config.vehicles[key].start);
    return counts;
}

function getNextCounts(prevCounts, config) {
    const next = {};
    Object.keys(config.vehicles).forEach(key => {
        const rule = config.vehicles[key];
        const randomStep = getRandomInt(-rule.stepMax, rule.stepMax);
        const rawValue = prevCounts[key] + randomStep;
        next[key] = clamp(rawValue, rule.min, rule.max);
    });
    return next;
}

// 目标车辆卡片动效渲染
function renderVehicleCounts(counts) {
    Object.keys(counts).forEach(key => {
        const elId = vehicleKeyToElementId[key];
        const el = document.getElementById(elId);
        if (el) {
            const oldVal = parseInt(el.textContent) || 0;
            const newVal = counts[key];
            if (oldVal !== newVal) {
                el.textContent = newVal;
                
                el.classList.remove('count-up', 'count-down');
                void el.offsetWidth; // 触发DOM重绘
                el.classList.add(newVal > oldVal ? 'count-up' : 'count-down');
                
                clearTimeout(el.animTimer);
                el.animTimer = setTimeout(() => {
                    el.classList.remove('count-up', 'count-down');
                }, 400);
            }
        }
    });
}

// ================= 车流量预测图 - 核心重构版 =================
function initFlowChart() {
    flowChartContainer = document.getElementById('flow-chart');
    if (!flowChartContainer) return;
    flowChartContainer.classList.add('flow-chart-ready');
}

function updateFlowChart(counts, droneId, config) {
    if (!flowChartContainer) return;

    const anchorTimeSec = getAnchorTimeSeconds(droneId, config.intervalMs / 1000);
    recordMeasuredPoint(droneId, counts, anchorTimeSec);

    const timeline = buildTimeline(anchorTimeSec);
    const seriesData = {};

    Object.keys(vehicleSeriesMeta).forEach(key => {
        seriesData[key] = buildOneSeries(droneId, key, timeline, counts, config.vehicles[key]);
    });

    renderFlowSvg(timeline, seriesData);
}

function getAnchorTimeSeconds(droneId, fallbackStepSec) {
    const now = new Date();
    // 转换为距离今日 00:00:00 的总秒数
    return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
}

function buildTimeline(anchorTimeSec) {
    const timeline = [];
    const pastStep = flowChartConfig.pastDurationSeconds / flowChartConfig.anchorIndex;
    const futurePoints = flowChartConfig.totalPoints - 1 - flowChartConfig.anchorIndex;
    const futureStep = flowChartConfig.futureDurationSeconds / futurePoints;

    for (let i = 0; i < flowChartConfig.totalPoints; i++) {
        if (i <= flowChartConfig.anchorIndex) {
            timeline.push(anchorTimeSec - (flowChartConfig.anchorIndex - i) * pastStep);
        } else {
            timeline.push(anchorTimeSec + (i - flowChartConfig.anchorIndex) * futureStep);
        }
    }
    return timeline;
}

function recordMeasuredPoint(droneId, counts, anchorTimeSec) {
    if (!flowHistoryByDrone[droneId]) flowHistoryByDrone[droneId] = {};
    Object.keys(vehicleSeriesMeta).forEach(key => {
        if (!flowHistoryByDrone[droneId][key]) flowHistoryByDrone[droneId][key] = [];
        const history = flowHistoryByDrone[droneId][key];
        history.push({ t: anchorTimeSec, v: counts[key] });
        if (history.length > 200) history.shift();
    });
}

function buildOneSeries(droneId, key, timeline, counts, rule) {
    const history = (flowHistoryByDrone[droneId] && flowHistoryByDrone[droneId][key]) || [];
    const measuredCount = flowChartConfig.anchorIndex + 1;
    const measuredValues = [];

    const recent = history.slice(-measuredCount).map(item => item.v);
    if (recent.length === 0) {
        for (let i = 0; i < measuredCount; i++) measuredValues.push(counts[key]);
    } else if (recent.length < measuredCount) {
        const fill = recent[0];
        for (let i = 0; i < measuredCount - recent.length; i++) measuredValues.push(fill);
        measuredValues.push(...recent);
    } else {
        measuredValues.push(...recent);
    }

    const allValues = [...measuredValues];
    const tail = measuredValues[measuredValues.length - 1];
    const ref = measuredValues[Math.max(0, measuredValues.length - 3)];
    let trend = (tail - ref) / 2;

    const futureCount = flowChartConfig.totalPoints - measuredCount;
    let prev = tail;

    for (let i = 0; i < futureCount; i++) {
        const noise = getRandomInt(-rule.stepMax, rule.stepMax) * 0.45;
        trend *= 0.92;
        const forecast = prev + trend + noise;
        const nextValue = clamp(Math.round(forecast), rule.min, rule.max);
        allValues.push(nextValue);
        prev = nextValue;
    }

    const points = timeline.map((t, i) => ({ xTime: t, yValue: allValues[i] }));
    return {
        measured: points.slice(0, measuredCount),
        predicted: points.slice(measuredCount - 1), 
        allValues
    };
}

// ================= DOM 重用渲染引擎 (确保动画丝滑无卡顿) =================
function renderFlowSvg(timeline, seriesData) {
    const width = flowChartContainer.clientWidth;
    const height = flowChartContainer.clientHeight;
    if (width < 40 || height < 40) return;

    if (width !== lastSvgWidth || height !== lastSvgHeight) {
        buildSvgStructure(width, height);
        lastSvgWidth = width;
        lastSvgHeight = height;
    }

    updateSvgElements(width, height, timeline, seriesData);
}

// 建立带有科技感的基础 SVG 结构（增强版：明显区分实测与预测区域）
function buildSvgStructure(width, height) {
    const padding = { top: 60, right: 30, bottom: 40, left: 50 };
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;
    const keys = Object.keys(vehicleSeriesMeta);

    // 渐变与辉光滤镜
    let defsHtml = `<defs>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
            </feMerge>
        </filter>
        <linearGradient id="gridGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="rgba(56, 189, 248, 0.15)"/>
            <stop offset="100%" stop-color="rgba(56, 189, 248, 0.01)"/>
        </linearGradient>
    `;
    keys.forEach(key => {
        defsHtml += `<linearGradient id="grad-${key}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${vehicleSeriesMeta[key].color}" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="${vehicleSeriesMeta[key].color}" stop-opacity="0.0"/>
        </linearGradient>`;
    });
    defsHtml += `</defs>`;

    // 网格与基准线
    let gridHtml = `<rect x="${padding.left}" y="${padding.top}" width="${plotW}" height="${plotH}" fill="url(#gridGrad)" stroke="rgba(56, 189, 248, 0.2)" stroke-width="1" />`;
    const yGrid = 5;
    for (let i = 0; i <= yGrid; i++) {
        const y = padding.top + (i / yGrid) * plotH;
        gridHtml += `<line x1="${padding.left}" y1="${y}" x2="${padding.left + plotW}" y2="${y}" stroke="rgba(148,163,184,0.15)" stroke-dasharray="4 4" />`;
        gridHtml += `<text id="y-lbl-${i}" x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="#94a3b8" class="tech-font"></text>`;
    }

    // X轴时间占位标签
    let xLabelHtml = '';
    const labelStep = 4;
    for (let i = 0; i < flowChartConfig.totalPoints; i += labelStep) {
        const x = padding.left + (i / (flowChartConfig.totalPoints - 1)) * plotW;
        xLabelHtml += `<text id="x-lbl-${i}" x="${x}" y="${height - 15}" text-anchor="middle" font-size="11" fill="#94a3b8" class="tech-font"></text>`;
    }

    // 完美避免重叠的顶部图例
    let legendHtml = '';
    const legendItemW = 75;
    const totalLegendW = keys.length * legendItemW;
    const startX = padding.left + (plotW - totalLegendW) / 2;
    keys.forEach((key, idx) => {
        const cx = startX + idx * legendItemW;
        const cy = 25;
        legendHtml += `
            <circle cx="${cx}" cy="${cy}" r="4" fill="${vehicleSeriesMeta[key].color}" filter="url(#glow)"/>
            <text x="${cx + 8}" y="${cy + 4}" font-size="11" fill="#cbd5e1">${vehicleSeriesMeta[key].label}</text>
        `;
    });

    // ================= 核心修改区：当前时间定位线与区域划分 =================
    const anchorX = padding.left + (flowChartConfig.anchorIndex / (flowChartConfig.totalPoints - 1)) * plotW;
    const predictAreaW = padding.left + plotW - anchorX;
    
    const nowLineHtml = `
        <!-- 预测区域的半透明高亮底色，增加区分度 -->
        <rect x="${anchorX}" y="${padding.top}" width="${predictAreaW}" height="${plotH}" fill="rgba(56, 189, 248, 0.06)" />

        <!-- 醒目的垂直虚线 -->
        <line id="now-line" x1="${anchorX}" y1="${padding.top}" x2="${anchorX}" y2="${padding.top + plotH}" stroke="#38bdf8" stroke-width="1.8" stroke-dasharray="6 6" filter="url(#glow)" />
        
        <!-- 左右两侧的方向文字提示 -->
        <text x="${anchorX - 10}" y="${padding.top + 16}" text-anchor="end" font-size="11" fill="#94a3b8" font-style="italic" letter-spacing="1">← 历史实测</text>
        <text x="${anchorX + 10}" y="${padding.top + 16}" text-anchor="start" font-size="11" fill="#38bdf8" font-style="italic" letter-spacing="1" filter="url(#glow)">趋势预测 →</text>

        <!-- 顶部 Label 居中标签 -->
        <rect x="${anchorX - 36}" y="${padding.top - 22}" width="72" height="22" rx="4" fill="#0f172a" stroke="#38bdf8" stroke-width="1.5" filter="url(#glow)" />
        <text x="${anchorX}" y="${padding.top - 6}" text-anchor="middle" font-size="11" fill="#f8fafc" font-weight="bold">当前检测</text>
    `;

    // 动态数据路径节点预埋 (重点使用 class svg-anim)
    let dataHtml = '';
    keys.forEach(key => {
        const color = vehicleSeriesMeta[key].color;
        dataHtml += `<path id="area-m-${key}" fill="url(#grad-${key})" class="svg-anim" d="" />`;
        // 实测线条（实线）
        dataHtml += `<path id="line-m-${key}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" filter="url(#glow)" class="svg-anim" d="" />`;
        // 预测线条（虚线）
        dataHtml += `<path id="line-p-${key}" fill="none" stroke="${color}" stroke-opacity="0.8" stroke-width="2" stroke-dasharray="6 4" stroke-linecap="round" class="svg-anim" d="" />`;
        // 呼吸点
        dataHtml += `<circle id="pt-m-${key}" r="4" fill="#0f172a" stroke="${color}" stroke-width="2" filter="url(#glow)" class="svg-anim-pt" />`;
    });

    flowChartContainer.innerHTML = `
        <svg class="flow-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
            ${defsHtml} ${gridHtml}
            <line x1="${padding.left}" y1="${padding.top + plotH}" x2="${padding.left + plotW}" y2="${padding.top + plotH}" stroke="#475569" stroke-width="1.5" />
            <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + plotH}" stroke="#475569" stroke-width="1.5" />
            ${xLabelHtml} ${legendHtml} ${nowLineHtml} ${dataHtml}
        </svg>`;
}

// 刷新 DOM 属性（触发形变动画）
function updateSvgElements(width, height, timeline, seriesData) {
    const padding = { top: 60, right: 30, bottom: 40, left: 50 };
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;

    const allVals = [];
    Object.keys(seriesData).forEach(k => allVals.push(...seriesData[k].allValues));
    const yMin = Math.max(0, Math.min(...allVals) - 5);
    const yMax = Math.max(yMin + 10, Math.max(...allVals) + 8);

    const xAt = idx => padding.left + (idx / (flowChartConfig.totalPoints - 1)) * plotW;
    const yAt = val => padding.top + (1 - (val - yMin) / (yMax - yMin)) * plotH;

    // 刷 Y 轴
    for (let i = 0; i <= 5; i++) {
        const el = document.getElementById(`y-lbl-${i}`);
        if (el) el.textContent = Math.round(yMax - (i / 5) * (yMax - yMin));
    }

    // 刷 X 轴
    for (let i = 0; i < flowChartConfig.totalPoints; i += 4) {
        const el = document.getElementById(`x-lbl-${i}`);
        if (el) el.textContent = formatHHMMSS(timeline[i]);
    }

    // 刷线条 (产生丝滑贝塞尔过渡)
    Object.keys(seriesData).forEach(key => {
        const data = seriesData[key];
        
        const dLineM = toSmoothPath(data.measured, xAt, yAt, 0);
        document.getElementById(`line-m-${key}`).setAttribute('d', dLineM);

        if (data.measured.length > 0) {
            const dArea = dLineM + ` L ${xAt(data.measured.length - 1)} ${padding.top + plotH} L ${xAt(0)} ${padding.top + plotH} Z`;
            document.getElementById(`area-m-${key}`).setAttribute('d', dArea);
            
            const ptEl = document.getElementById(`pt-m-${key}`);
            ptEl.setAttribute('cx', xAt(flowChartConfig.anchorIndex));
            ptEl.setAttribute('cy', yAt(data.measured[data.measured.length - 1].yValue));
        }

        const dLineP = toSmoothPath(data.predicted, xAt, yAt, flowChartConfig.anchorIndex);
        document.getElementById(`line-p-${key}`).setAttribute('d', dLineP);
    });
}

// 平滑贝塞尔曲线算法
function toSmoothPath(points, xAt, yAt, offsetIndex = 0) {
    if (!points || points.length === 0) return '';
    let path = `M ${xAt(offsetIndex)} ${yAt(points[0].yValue)}`;
    for (let i = 0; i < points.length - 1; i++) {
        const x1 = xAt(i + offsetIndex), y1 = yAt(points[i].yValue);
        const x2 = xAt(i + 1 + offsetIndex), y2 = yAt(points[i + 1].yValue);
        const cx1 = x1 + (x2 - x1) * 0.5, cy1 = y1;
        const cx2 = x1 + (x2 - x1) * 0.5, cy2 = y2;
        path += ` C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
    }
    return path;
}

function formatHHMMSS(seconds) {
    let safe = Math.floor(seconds);
    
    // 处理跨越凌晨的情况（如果是历史记录推算到了昨天，加上一天的秒数）
    while (safe < 0) safe += 86400; 
    
    const h = String(Math.floor((safe / 3600) % 24)).padStart(2, '0');
    const m = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
    const s = String(safe % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
}
function getRandomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }

/* START OF FILE datacenter.js (部分追加和修改) */

// 1. 在开头的 DOMContentLoaded 中追加 bindEventScrollPause();
// 修改原有的 DOMContentLoaded 如下：
document.addEventListener('DOMContentLoaded', () => {
    bindNavTabs();
    bindSearch();
    bindDroneItems();
    initFlowChart();
    
    bindEventScrollPause(); // 新增：绑定悬停暂停动画事件

    updateDashboardData('drone_01');
});

// 2. 修改 updateDashboardData 函数，加入 renderEventList 调用
function updateDashboardData(droneId) {
    currentDroneId = droneId;
    startRealtimeSimulation(droneId);
    renderEventList(droneId); // 新增：切换无人机时重新渲染并滚动事件列表
}

// ================= 最新实战化事件数据底库 (按不同场景高度定制) =================
const eventsLibrary = {
    'drone_01': [ // 繁华市区主干道
        { type: '轻度拥堵', desc: '主干道由南向北方向车速缓慢，排队长度约200米', level: 'warning', status: '持续中' },
        { type: '违停抓拍', desc: '车牌粤B·***23 占用公交车道，已记录抓拍', level: 'danger', status: '已取证' },
        { type: '实线变道', desc: '交叉路口导向车道内实线变道违章检测', level: 'warning', status: '已记录' },
        { type: '非机动车逆行', desc: '外卖配送车辆在机动车道逆向行驶', level: 'danger', status: '高危' },
        { type: '异常上下客', desc: '网约车在主干道无停靠带违规上下客', level: 'warning', status: '已记录' },
        { type: '行人违规', desc: '行人横穿马路，未走斑马线预警', level: 'warning', status: '持续中' },
        { type: '路口溢出', desc: '直行车辆滞留路口中央，影响侧向通行', level: 'warning', status: '持续中' },
        { type: '轻微刮蹭', desc: '两车追尾占用左侧快车道，人员已撤离', level: 'danger', status: '处置中' },
        { type: '缓行预警', desc: '绿化带洒水车低速作业，后方车辆排队', level: 'info', status: '正常' },
        { type: '设施故障', desc: '前方第二路口交通信号灯黄闪异常预警', level: 'info', status: '已报修' },
        { type: '未礼让行人', desc: '机动车在无信号灯斑马线未减速避让', level: 'warning', status: '已记录' }
    ],
    'drone_02': [ // 工业区/物流园周边
        { type: '违规占道', desc: '重型半挂牵引车违规占用左侧小客车道行驶', level: 'warning', status: '持续中' },
        { type: '超载嫌疑', desc: '四轴货车行驶轨迹异常、轮胎形变严重', level: 'danger', status: '跟踪中' },
        { type: '散落物检测', desc: '右侧车道发现不明纸箱及包装废弃物', level: 'warning', status: '待清理' },
        { type: '遗撒预警', desc: '泥头车未密闭导致砂石遗撒路面', level: 'danger', status: '已取证' },
        { type: '车辆积压', desc: '物流园3号入口货车排队积压溢出至主路', level: 'warning', status: '持续中' },
        { type: '违停阻碍', desc: '厂区周边机动车双排违停，导致单向拥堵', level: 'warning', status: '已记录' },
        { type: '盲区预警', desc: '大型车辆右转弯，侧方有非机动车靠近', level: 'danger', status: '高危' },
        { type: '违规上路', desc: '无牌无照厂区叉车违规驶入市政道路', level: 'danger', status: '已记录' },
        { type: '危化品监控', desc: '危化品运输车辆进入重点监控路段，轨迹正常', level: 'info', status: '监控中' },
        { type: '路面破损', desc: '道路局部出现坑洼破损，疑似重车碾压导致', level: 'info', status: '已上报' }
    ],
    'drone_03': [ // 郊区/城乡结合部
        { type: '机非混行', desc: '多辆电动自行车占用机动车道快速行驶', level: 'warning', status: '持续中' },
        { type: '未戴头盔', desc: '摩托车驾驶员及乘客未佩戴安全头盔', level: 'warning', status: '已记录' },
        { type: '违规载人', desc: '农用三轮车车厢内违规搭载多名人员', level: 'danger', status: '高危' },
        { type: '占道经营', desc: '路边摊贩占用非机动车道，影响正常通行', level: 'warning', status: '持续中' },
        { type: '无灯光行驶', desc: '视线不良时段，面包车未开启照明灯光', level: 'danger', status: '已记录' },
        { type: '动物穿行', desc: '监测到流浪犬只横穿乡镇级公路预警', level: 'info', status: '持续中' },
        { type: '车辆抛锚', desc: '一辆小轿车长时间停靠路边，双闪开启', level: 'warning', status: '观察中' },
        { type: '逆向行驶', desc: '两轮摩托车在单行线逆向行驶', level: 'danger', status: '已记录' },
        { type: '超速嫌疑', desc: '限速60路段，目标车辆预估时速超80km/h', level: 'warning', status: '已测速' },
        { type: '非法倾倒', desc: '疑似建筑废弃物非法倾倒于路侧绿化带', level: 'warning', status: '已取证' }
    ],
    'drone_04': [ // 高速公路/快速路段
        { type: '占用应急车道', desc: '非紧急情况下，社会车辆占用应急车道行驶', level: 'danger', status: '已取证' },
        { type: '违规倒车', desc: '临近枢纽匝道口，车辆违规减速并倒车', level: 'danger', status: '高危' },
        { type: '低速行驶', desc: '小客车在超车道低于最低限速(90km/h)行驶', level: 'warning', status: '持续中' },
        { type: '异常停车', desc: '硬路肩停车未放置三角警示牌，人员未撤离', level: 'danger', status: '高危' },
        { type: '连续变道', desc: '车辆一次性连续跨越两条车道', level: 'warning', status: '已记录' },
        { type: '疲劳驾驶', desc: '车辆轨迹呈S型偏移，压线行驶频发', level: 'danger', status: '跟踪中' },
        { type: '高速散落物', desc: '行车道内发现散落木板，影响后车避让', level: 'warning', status: '待清理' },
        { type: '团雾预警', desc: '前方2公里处局部能见度低，建议开启雾灯', level: 'info', status: '广播中' },
        { type: '客车超速', desc: '大型公路客车预估时速超100km/h，触发预警', level: 'danger', status: '已取证' },
        { type: '未保车距', desc: '车速过快且与前车距离不足50米', level: 'warning', status: '持续中' },
        { type: '违规加塞', desc: '枢纽互通出口导流线处车辆强行变道加塞', level: 'warning', status: '已记录' }
    ]
};

// ================= 事件滚动核心逻辑 =================
let scrollPosY = 0;
let isEventHovered = false;
let lastAnimTime = 0;

// 为模拟真实感，根据当前时间随机往前倒推生成时间戳
function generateEventData(droneId) {
    const events = eventsLibrary[droneId] || eventsLibrary['drone_01'];
    let now = new Date();
    let simulatedEvents = [];
    
    events.forEach(ev => {
        let timeOffset = Math.floor(Math.random() * 300) + 30; // 往前推导 30~330 秒内
        now = new Date(now.getTime() - timeOffset * 1000);
        
        simulatedEvents.push({
            ...ev,
            timeStr: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`,
            timestamp: now.getTime()
        });
    });
    // 按时间降序（最新发生排在上面）
    simulatedEvents.sort((a, b) => b.timestamp - a.timestamp);
    return simulatedEvents;
}

function renderEventList(droneId) {
    const track = document.getElementById('event-track');
    if (!track) return;
    
    // 切换时清除旧动画重置状态
    if (window.eventScrollAnim) {
        cancelAnimationFrame(window.eventScrollAnim);
        window.eventScrollAnim = null;
    }
    track.style.transform = `translateY(0px)`;
    scrollPosY = 0;
    
    const events = generateEventData(droneId);
    let groupHtml = '<div class="event-scroll-group">';
    
    events.forEach(ev => {
        // 根据关键字智能赋予科技感标签配色
        let statusClass = 'status-recorded';
        if (ev.status.includes('中') || ev.status.includes('高危')) statusClass = 'status-active';
        else if (ev.status.includes('待') || ev.status.includes('修')) statusClass = 'status-processing';
        
        groupHtml += `
        <div class="event-item level-${ev.level}">
            <div class="event-time">${ev.timeStr}</div>
            <div class="event-content">
                <div class="event-header">
                    <span class="event-type">${ev.type}</span>
                    <span class="event-status ${statusClass}">${ev.status}</span>
                </div>
                <div class="event-desc">${ev.desc}</div>
            </div>
        </div>`;
    });
    groupHtml += '</div>';
    
    // 首尾相连的无缝滚动克隆
    track.innerHTML = groupHtml + groupHtml;
    
    // 启动滚动循环
    lastAnimTime = 0; 
    startEventScroll();
}

function bindEventScrollPause() {
    const wrapper = document.getElementById('event-wrapper');
    if (!wrapper) return;
    wrapper.addEventListener('mouseenter', () => isEventHovered = true);
    wrapper.addEventListener('mouseleave', () => isEventHovered = false);
}

function startEventScroll() {
    const track = document.getElementById('event-track');
    
    function step(currentTime) {
        window.eventScrollAnim = requestAnimationFrame(step);
        
        if (!lastAnimTime) lastAnimTime = currentTime;
        const dt = currentTime - lastAnimTime;
        lastAnimTime = currentTime; 
        
        if (isEventHovered) return; // 悬停暂停视觉流
        
        const groupHeight = track.firstElementChild?.offsetHeight;
        if (!groupHeight) return;
        
        scrollPosY += (20 * dt) / 1000; // 设置 20px/s 的优雅流动速度
        
        // 当滚动走完第一组高度，瞬间复位达到无缝幻觉
        if (scrollPosY >= groupHeight) {
            scrollPosY -= groupHeight;
        }
        
        track.style.transform = `translateY(-${scrollPosY}px)`;
    }
    
    window.eventScrollAnim = requestAnimationFrame(step);
}
/* END OF FILE datacenter.js (部分追加和修改) */
// ==========================================
// 🌟 动态数据报表导出引擎 (CSV 生成器)
// ==========================================

// 1. 动态注入悬浮导出按钮
function injectExportButton() {
    const btn = document.createElement('button');
    btn.innerHTML = '导出当前数据报表 (CSV)';
    // 设置高逼格的悬浮按钮样式
    btn.style.cssText = `
        position: fixed; 
        bottom: 30px; 
        right: 30px; 
        z-index: 9999; 
        padding: 12px 24px; 
        border-radius: 8px; 
        background: rgba(56, 189, 248, 0.15); 
        color: #38bdf8; 
        border: 1px solid #38bdf8; 
        font-weight: bold; 
        font-size: 14px;
        cursor: pointer; 
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(10px);
        transition: all 0.3s ease;
    `;
    
    // 增加悬停动效
    btn.onmouseover = () => {
        btn.style.background = '#38bdf8';
        btn.style.color = '#0f172a';
        btn.style.transform = 'translateY(-2px)';
    };
    btn.onmouseout = () => {
        btn.style.background = 'rgba(56, 189, 248, 0.15)';
        btn.style.color = '#38bdf8';
        btn.style.transform = 'translateY(0)';
    };

    // 绑定导出事件
    btn.onclick = exportDashboardToCSV;
    document.body.appendChild(btn);
}

// 2. 核心：提取大盘数据并生成 CSV 文件
function exportDashboardToCSV() {
    if (!currentDroneId) {
        alert('当前没有可导出的设备数据！');
        return;
    }

    const now = new Date();
    const timeStr = now.toLocaleString('zh-CN', { hour12: false });
    
    // 获取当前无人机的中文名称 (如果有的话)
    const activeItem = document.querySelector('.drone-item.active .drone-name');
    const droneName = activeItem ? activeItem.textContent : currentDroneId;

    // 🚨 核心：加入 \uFEFF (BOM头)，确保用 Excel 打开中文不会乱码
    let csvContent = '\uFEFF'; 

    // --- 模块 1: 车流量数据统计 ---
    csvContent += '========== 实时交通流量监测统计 ==========\n';
    csvContent += '统计生成时间,设备编号,公交车 (辆),小轿车 (辆),货车 (辆),卡车 (辆),面包车 (辆)\n';
    
    const counts = currentCounts || {};
    csvContent += `${timeStr},${droneName},${counts.bus || 0},${counts.car || 0},${counts.freight || 0},${counts.truck || 0},${counts.van || 0}\n\n`;

    // --- 模块 2: 异常事件排查台账 ---
    csvContent += '========== 道路异常事件排查台账 ==========\n';
    csvContent += '发现时间,事件类型,危险等级,当前状态,详细描述\n';

    // 调用现有的 generateEventData 拿到最新的动态时间戳事件
    const events = generateEventData(currentDroneId);
    
    events.forEach(ev => {
        // 安全处理：如果描述里自带逗号，必须用双引号包裹，否则 CSV 会错列
        const safeDesc = `"${ev.desc.replace(/"/g, '""')}"`;
        // 映射危险等级中文
        const levelText = ev.level === 'danger' ? '紧急危险' : (ev.level === 'warning' ? '次紧急' : '一般提示');
        
        csvContent += `${ev.timeStr},${ev.type},${levelText},${ev.status},${safeDesc}\n`;
    });

    // --- 触发浏览器原生下载 ---
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `OmniAero_${droneName}_综合数据报表_${now.getTime()}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // (如果你有类似之前 map.js 里的全局提示框，可以加上下面这句)
    // if(window.showToast) window.showToast('✅ CSV 数据报表已成功导出！');
}

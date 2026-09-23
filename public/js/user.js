// Fronted/js/user.js

// === 全局状态变量 ===
let isMultiMode = false; 
let selectedDrones = []; 
let currentMode = 'RGB'; 
let currentSingleDroneId = 'drone_01'; 
let currentSettingsDroneId = null; 
// === 抽屉控制与状态渲染===
let multimodalDrawerOpen = false;
let multimodalAnalyzing = false;
let multimodalTimer = null;
let multimodalLastHash = '';
let multimodalLastResult = null;
let multimodalLastFrame = '';
let multimodalLastAnalyzeAt = 0;
let multimodalMessageId = 0;
let multimodalChatBusy = false;
const droneTrackCache = {};
const droneTrackState = {};




// === 存储每台无人机的独立设置 ===
const droneConfigStore = {};

function getDefaultDroneConfig() {
    return {
        rgbUrl: '', irUrl: '',
        alignAuto: true, alignX: 0, alignY: 0,
        rgbEnhance: false, irEnhance: false, latencyOpt: true,
        frameDrop: '0', boxColor: '#38bdf8', boxThick: '2',
        showAngle: true, showClass: true, irColorMode: 'iron', showTrack: false,
        model: ''
    };
}

// === 自定义弹窗函数 ===
function showCustomAlert(message, type = 'info') {
    const overlay = document.getElementById('customAlert');
    const msgBox = document.getElementById('customAlertMessage');
    const iconBox = document.getElementById('customAlertIcon');

    const icons = {
        error: `<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
        warning: `<svg viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
        info: `<svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
    };

    iconBox.innerHTML = icons[type] || icons['info'];
    msgBox.textContent = message;
    overlay.style.display = 'flex';
}

function hideCustomAlert() {
    document.getElementById('customAlert').style.display = 'none';
}

function updateModelOptionsState() {
    const modelOptions = document.querySelectorAll('.model-option');
    const modelStates = JSON.parse(localStorage.getItem('omni_model_states') || '{}');
    
    modelOptions.forEach(option => {
        const modelName = option.value;
        const isLoaded = modelStates[modelName] || option.getAttribute('data-loaded') === 'true';
        option.disabled = !isLoaded;
        if (!isLoaded) {
            option.style.color = '#94a3b8';
        } else {
            option.style.color = '';
        }
    });
}

window.addEventListener('modelStateChanged', updateModelOptionsState);

document.addEventListener('DOMContentLoaded', () => {
    restoreState(); 
    bindMultimodalAssistant();
    bindMultimodalComposer();
    setMultimodalEmpty();
    bindNavTabs();
    bindSearch();
    bindMultiModeBtn();
    bindDroneItems();
    bindVideoModeMenu();
    bindSettingsGear();    
    bindSettingsPanel();   
    

    document.getElementById('closeAlertBtn').addEventListener('click', hideCustomAlert);
    document.getElementById('closeAlertIcon').addEventListener('click', hideCustomAlert);

    updateModelOptionsState();
    
    // 🚨 初始绑定所有的画面ROI框选监听
    document.querySelectorAll('.video-box').forEach(box => bindROIZoom(box));
    
    // 🚨 跨页面实时联动，当 OmniAero-Semi 模型开启/关闭时刷新画面
    window.addEventListener('storage', (e) => {
    if (e.key === 'omni_semi_enabled') {
        refreshAllVideos();
    }
});




    refreshAllVideos();
    syncHudInfo();

    requestAnimationFrame(renderAiCanvasLegacy || function(){}); 
});

function restoreState() {
    const savedMode = localStorage.getItem('omni_video_mode');
    if (savedMode) {
        currentMode = savedMode;
        const btn = document.getElementById('modeBtn');
        const menu = document.getElementById('modeMenu');
        if (btn && menu) {
            const opt = Array.from(menu.querySelectorAll('div')).find(d => d.getAttribute('data-mode') === currentMode);
            if (opt) btn.innerHTML = `${opt.textContent} ▼`;
        }
    }

    const connectedStr = localStorage.getItem('omni_connected_drones');
    if (connectedStr) {
        const connectedMap = JSON.parse(connectedStr);
        document.querySelectorAll('.drone-item').forEach(item => {
            const id = item.getAttribute('data-id');
            if (connectedMap[id]) {
                const dot = item.querySelector('.status-dot');
                const nameEl = item.querySelector('.drone-name');
                const statusEl = item.querySelector('.drone-status');
                
                dot.classList.remove('offline');
                nameEl.style.color = '#f8fafc';
                statusEl.textContent = connectedMap[id].statusText;
                item.setAttribute('data-task', connectedMap[id].task);
            }
        });
    }

    const savedSingle = localStorage.getItem('omni_current_single_drone');
    if (savedSingle) {
        currentSingleDroneId = savedSingle;
        document.querySelectorAll('.drone-item').forEach(el => el.classList.remove('active'));
        const activeItem = document.querySelector(`.drone-item[data-id="${currentSingleDroneId}"]`);
        if (activeItem) activeItem.classList.add('active');
    }
}
function bindMultimodalAssistant() {
    const handle = document.getElementById('mm-assistant-handle');
    const panel = document.getElementById('mm-assistant-panel');

    if (!handle || !panel) return;

    handle.addEventListener('click', () => {
        multimodalDrawerOpen = !multimodalDrawerOpen;
        panel.classList.toggle('open', multimodalDrawerOpen);
        handle.classList.toggle('open', multimodalDrawerOpen);

        const arrow = handle.querySelector('.mm-handle-arrow');
        if (arrow) {
            arrow.textContent = multimodalDrawerOpen ? '→' : '←';
        }
    });
}

function bindMultimodalComposer() {
    const detectBtn = document.getElementById('mm-detect-btn');
    const sendBtn = document.getElementById('mm-send-btn');
    const inputEl = document.getElementById('mm-chat-input');

    if (detectBtn) {
        detectBtn.addEventListener('click', () => {
            requestMultimodalAnalysis('manual_detect');
        });
    }

    if (sendBtn && inputEl) {
        sendBtn.addEventListener('click', () => {
            const text = inputEl.value.trim();
            if (!text) return;
            inputEl.value = '';
            requestMultimodalFollowup(text);
        });

        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const text = inputEl.value.trim();
                if (!text) return;
                inputEl.value = '';
                requestMultimodalFollowup(text);
            }
        });
    }
}

function setMultimodalStatus(text) {
    const statusEl = document.getElementById('mm-status');
    if (statusEl) statusEl.textContent = text;
}

function setMultimodalEmpty() {
    const outputEl = document.getElementById('mm-output');
    if (!outputEl) return;

    outputEl.innerHTML = `
        <div class="mm-empty">
            请点击下方“自动检测”分析当前路况
        </div>
    `;
}

function escapeHtml(text) {
    return String(text || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function getRiskMeta(level) {
    if (level === 'high') {
        return { className: 'mm-risk-high', label: '高风险', title: '高风险' };
    }

    if (level === 'medium') {
        return { className: 'mm-risk-medium', label: '一般风险', title: '一般风险' };
    }

    return { className: 'mm-risk-low', label: '低风险', title: '低风险' };
}

function getVehicleIconSvg(type) {
    const icons = {
        car: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 16l1.5-5h11L19 16"></path>
                <path d="M4 16h16"></path>
                <path d="M7 16v2"></path>
                <path d="M17 16v2"></path>
                <circle cx="8" cy="16" r="1.5"></circle>
                <circle cx="16" cy="16" r="1.5"></circle>
            </svg>
        `,
        bus: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="5" y="4" width="14" height="13" rx="2"></rect>
                <path d="M8 17v2"></path>
                <path d="M16 17v2"></path>
                <circle cx="8" cy="17" r="1.2"></circle>
                <circle cx="16" cy="17" r="1.2"></circle>
                <path d="M8 8h8"></path>
            </svg>
        `,
        truck: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 8h10v8H3z"></path>
                <path d="M13 11h4l2 2v3h-6z"></path>
                <circle cx="8" cy="17" r="1.5"></circle>
                <circle cx="17" cy="17" r="1.5"></circle>
            </svg>
        `,
        motorcycle: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="7" cy="17" r="2"></circle>
                <circle cx="17" cy="17" r="2"></circle>
                <path d="M7 17l4-6h3"></path>
                <path d="M14 11l3 6"></path>
                <path d="M12 8h3"></path>
            </svg>
        `,
        other: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="5" y="6" width="14" height="10" rx="2"></rect>
                <path d="M9 10h6"></path>
                <path d="M12 7v6"></path>
            </svg>
        `
    };

    return icons[type] || icons.other;
}

function getSceneIconSvg(type) {
    const icons = {
        highway: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 21l2-18"></path>
                <path d="M16 21L14 3"></path>
                <path d="M12 6v2"></path>
                <path d="M12 12v2"></path>
                <path d="M12 18v2"></path>
            </svg>
        `,
        intersection: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 10h16"></path>
                <path d="M4 14h16"></path>
                <path d="M10 4v16"></path>
                <path d="M14 4v16"></path>
            </svg>
        `,
        urban_road: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 20h16"></path>
                <path d="M6 20V8h4v12"></path>
                <path d="M14 20V5h4v15"></path>
                <path d="M8 11h1"></path>
                <path d="M16 8h1"></path>
                <path d="M16 12h1"></path>
            </svg>
        `,
        parking_lot: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="5" y="4" width="14" height="16" rx="2"></rect>
                <path d="M10 16V8h4a2 2 0 0 1 0 4h-4"></path>
            </svg>
        `,
        bridge: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 17h16"></path>
                <path d="M6 17c1-5 3-8 6-8s5 3 6 8"></path>
                <path d="M8 17V9"></path>
                <path d="M16 17V9"></path>
            </svg>
        `,
        unknown: `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="8"></circle>
                <path d="M9.5 9a2.6 2.6 0 0 1 5 1c0 2-2.5 2-2.5 4"></path>
                <path d="M12 17h.01"></path>
            </svg>
        `
    };

    return icons[type] || icons.unknown;
}

function getExpertIconSvg(type) {
    if (type === 'suggestion') {
        return `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 18h6"></path>
                <path d="M10 22h4"></path>
                <path d="M8 14a6 6 0 1 1 8 0c-.9.7-1 1.4-1 2H9c0-.6-.1-1.3-1-2z"></path>
            </svg>
        `;
    }

    return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="7" r="3"></circle>
            <path d="M5 21a7 7 0 0 1 14 0"></path>
            <path d="M18 8h2"></path>
            <path d="M19 7v2"></path>
        </svg>
    `;
}

function normalizeSceneType(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'highway') return 'highway';
    if (raw === 'intersection') return 'intersection';
    if (raw === 'urban_road') return 'urban_road';
    if (raw === 'parking_lot') return 'parking_lot';
    if (raw === 'bridge') return 'bridge';
    return 'unknown';
}

function getSceneLabel(type) {
    const labels = {
        highway: '高速道路',
        intersection: '交叉路口',
        urban_road: '城市道路',
        parking_lot: '停车区域',
        bridge: '桥梁道路',
        unknown: '道路场景'
    };

    return labels[type] || labels.unknown;
}

function sanitizeMultimodalResult(raw) {
    const scene = raw?.scene_overview || {};
    const sceneContext = raw?.scene_context || {};
    const risk = raw?.risk_assessment || {};
    const sceneType = normalizeSceneType(sceneContext?.type || scene?.type);

    let vehicles = Array.isArray(raw?.vehicle_statistics) ? raw.vehicle_statistics : [];

    if (!vehicles.length && raw?.vehicle_analysis?.by_type) {
        const byType = raw.vehicle_analysis.by_type;
        vehicles = [
            { type: 'car', label: '小汽车', count: Number(byType.car || 0), icon: 'car' },
            { type: 'bus', label: '公交车', count: Number(byType.bus || 0), icon: 'bus' },
            { type: 'truck', label: '货车', count: Number(byType.truck || 0), icon: 'truck' },
            { type: 'motorcycle', label: '摩托车', count: Number(byType.motorcycle || 0), icon: 'motorcycle' },
            { type: 'other', label: '其他车辆', count: Number(byType.other || 0), icon: 'other' }
        ].filter(item => item.count > 0);
    }

    const expertAnalysis = Array.isArray(raw?.expert_analysis)
        ? raw.expert_analysis.map(item => String(item || '').trim()).filter(Boolean)
        : [];

    const expertSuggestion = Array.isArray(raw?.expert_suggestion)
        ? raw.expert_suggestion.map(item => String(item || '').trim()).filter(Boolean)
        : [];

    return {
        scene_overview: {
            title: '当前路况',
            description: String(scene?.description || raw?.scene_summary || '当前道路整体通行状态较为稳定，建议持续监测。').trim()
        },
        scene_context: {
            type: sceneType,
            label: String(sceneContext?.label || getSceneLabel(sceneType)).trim(),
            icon: sceneType,
            description: String(sceneContext?.description || scene?.description || '当前画面属于道路交通监测场景。').trim()
        },
        vehicle_statistics: vehicles.map(item => ({
            type: item?.type || item?.icon || 'other',
            label: String(item?.label || '其他车辆').trim(),
            count: Math.max(0, Number(item?.count || 0)),
            icon: item?.icon || item?.type || 'other'
        })),
        risk_assessment: {
            level: String(risk?.level || 'low').trim().toLowerCase(),
            label: String(risk?.label || '').trim(),
            color: String(risk?.color || '').trim(),
            summary: String(risk?.summary || '当前画面未发现明显危险，整体风险较低。').trim()
        },
        expert_analysis: expertAnalysis.length
            ? expertAnalysis
            : [String(scene?.description || '当前道路整体通行状态较为稳定，建议持续监测。').trim()],
        expert_suggestion: expertSuggestion.length
            ? expertSuggestion
            : ['建议继续保持当前监测。']
    };
}

function renderVehicleRows(list) {
    const vehicles = Array.isArray(list) ? list : [];

    if (!vehicles.length) {
        return `
            <div class="mm-vehicle-row">
                <div class="mm-vehicle-main">
                    <span class="mm-vehicle-icon">${getVehicleIconSvg('other')}</span>
                    <span class="mm-vehicle-label">暂无车辆数据</span>
                </div>
                <div class="mm-vehicle-track">
                    <div class="mm-vehicle-fill" style="width: 0%;"></div>
                </div>
                <div class="mm-vehicle-count">0</div>
            </div>
        `;
    }

    const maxCount = Math.max(...vehicles.map(item => Number(item.count || 0)), 1);

    return vehicles.map(item => {
        const count = Math.max(0, Number(item.count || 0));
        const width = Math.max(8, Math.round((count / maxCount) * 100));

        return `
            <div class="mm-vehicle-row">
                <div class="mm-vehicle-main">
                    <span class="mm-vehicle-icon">${getVehicleIconSvg(item.icon || item.type)}</span>
                    <span class="mm-vehicle-label">${escapeHtml(item.label || '其他车辆')}</span>
                </div>
                <div class="mm-vehicle-track">
                    <div class="mm-vehicle-fill" style="width: ${width}%;"></div>
                </div>
                <div class="mm-vehicle-count">${count}</div>
            </div>
        `;
    }).join('');
}

function renderBulletList(list) {
    const items = Array.isArray(list) ? list : [];

    if (!items.length) {
        return '<li>暂无内容</li>';
    }

    return items
        .map(item => `<li>${escapeHtml(item)}</li>`)
        .join('');
}

function renderDetailItems(items) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return '<p>暂无详细内容。</p>';

    return `
        <ul class="mm-detail-list">
            ${list.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
    `;
}

function buildInsightMarkdown(title, items) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    const lines = [`### ${title}`];

    if (!list.length) {
        lines.push('- 暂无详细内容。');
    } else {
        list.forEach(item => {
            lines.push(`- ${item}`);
        });
    }

    return lines.join('\n');
}

function renderPrettyMarkdown(markdown) {
    const text = String(markdown || '').trim();
    if (!text) {
        return '<p class="mm-md-paragraph">暂无详细内容。</p>';
    }

    const lines = text.split('\n');
    const html = [];
    let listItems = [];

    const flushList = () => {
        if (!listItems.length) return;
        html.push(`<ul class="mm-md-list">${listItems.join('')}</ul>`);
        listItems = [];
    };

    lines.forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line) {
            flushList();
            return;
        }

        if (line.startsWith('### ')) {
            flushList();
            html.push(`<div class="mm-md-heading">${escapeHtml(line.slice(4))}</div>`);
            return;
        }

        if (line.startsWith('- ')) {
            listItems.push(`<li>${escapeHtml(line.slice(2))}</li>`);
            return;
        }

        flushList();
        html.push(`<p class="mm-md-paragraph">${escapeHtml(line)}</p>`);
    });

    flushList();
    return html.join('');
}

function bindInsightButtons(messageEl, payload) {
    if (!messageEl) return;

    const detailMap = {
        scene: {
            title: '道路场景说明',
            items: [payload.scene_context.description || payload.scene_overview.description]
        },
        analysis: {
            title: '专家分析',
            items: payload.expert_analysis
        },
        suggestion: {
            title: '专家建议',
            items: payload.expert_suggestion
        }
    };

    messageEl.querySelectorAll('[data-mm-detail]').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.getAttribute('data-mm-detail');
            const detail = detailMap[key];
            if (!detail) return;

            const panel = messageEl.querySelector(`[data-mm-detail-panel="${key}"]`);
            if (!panel) return;

            const isOpen = panel.classList.toggle('open');
            btn.classList.toggle('is-open', isOpen);

            const markdownEl = panel.querySelector('.mm-insight-markdown');
            if (markdownEl && !markdownEl.innerHTML.trim()) {
                markdownEl.innerHTML = renderPrettyMarkdown(buildInsightMarkdown(detail.title, detail.items));
            }

            const outputEl = document.getElementById('mm-output');
            if (outputEl && isOpen) {
                outputEl.scrollTop = outputEl.scrollHeight;
            }
        });
    });
}

function renderInsightTiles(payload) {
    return `
        <div class="mm-insight-grid">
            <div class="mm-insight-item">
                <button class="mm-insight-tile" type="button" data-mm-detail="analysis">
                    <span class="mm-insight-icon">${getExpertIconSvg('analysis')}</span>
                    <span class="mm-insight-copy">
                        <span class="mm-insight-label">专家分析</span>
                        <span class="mm-insight-hint">点击展开</span>
                    </span>
                </button>
                <div class="mm-insight-detail" data-mm-detail-panel="analysis">
                    <div class="mm-insight-markdown"></div>
                </div>
            </div>
            <div class="mm-insight-item">
                <button class="mm-insight-tile" type="button" data-mm-detail="suggestion">
                    <span class="mm-insight-icon">${getExpertIconSvg('suggestion')}</span>
                    <span class="mm-insight-copy">
                        <span class="mm-insight-label">专家建议</span>
                        <span class="mm-insight-hint">点击展开</span>
                    </span>
                </button>
                <div class="mm-insight-detail" data-mm-detail-panel="suggestion">
                    <div class="mm-insight-markdown"></div>
                </div>
            </div>
        </div>
    `;
}

function trimMultimodalHistory(outputEl) {
    const messages = outputEl.querySelectorAll('.mm-message');
    if (messages.length <= 8) return;

    const removeCount = messages.length - 8;
    for (let i = 0; i < removeCount; i += 1) {
        messages[i].remove();
    }
}

function clearMultimodalEmpty(outputEl) {
    if (outputEl && outputEl.querySelector('.mm-empty')) {
        outputEl.innerHTML = '';
    }
}

function appendAssistantPending(statusText = '正在检测...', detailText = '正在检测当前路况，请稍候...') {
    const outputEl = document.getElementById('mm-output');
    if (!outputEl) return null;

    clearMultimodalEmpty(outputEl);

    multimodalMessageId += 1;

    const messageEl = document.createElement('div');
    messageEl.className = 'mm-message assistant';
    messageEl.setAttribute('data-mm-message-id', String(multimodalMessageId));

    messageEl.innerHTML = `
        <div class="mm-avatar">
            <img src="/assets/images/logo.png" alt="多模态助手">
        </div>
        <div class="mm-message-body">
            <div class="mm-message-status">${escapeHtml(statusText)}</div>
            <div class="mm-pending-box">
                <div class="mm-pending-text">${escapeHtml(detailText)}</div>
            </div>
        </div>
    `;

    outputEl.appendChild(messageEl);
    trimMultimodalHistory(outputEl);
    outputEl.scrollTop = outputEl.scrollHeight;

    return messageEl;
}

function appendUserMessage(text) {
    const outputEl = document.getElementById('mm-output');
    if (!outputEl) return;

    clearMultimodalEmpty(outputEl);

    const messageEl = document.createElement('div');
    messageEl.className = 'mm-message user';

    messageEl.innerHTML = `
        <div class="mm-message-body">
            <div class="mm-message-status">用户追问</div>
            <div class="mm-user-text">${escapeHtml(text)}</div>
        </div>
    `;

    outputEl.appendChild(messageEl);
    trimMultimodalHistory(outputEl);
    outputEl.scrollTop = outputEl.scrollHeight;
}

function replacePendingWithAssistantText(messageEl, statusText, answerText) {
    if (!messageEl) return;

    const body = messageEl.querySelector('.mm-message-body');
    if (!body) return;

    body.innerHTML = `
        <div class="mm-message-status">${escapeHtml(statusText)}</div>
        <div class="mm-pending-box">
            <div class="mm-assistant-text">${escapeHtml(answerText || '暂无回答。')}</div>
        </div>
    `;

    const outputEl = document.getElementById('mm-output');
    if (outputEl) {
        outputEl.scrollTop = outputEl.scrollHeight;
    }
}

function appendAnalysisCard(result, imageBase64, statusText = '检测完成') {
    const outputEl = document.getElementById('mm-output');
    if (!outputEl) return;

    clearMultimodalEmpty(outputEl);

    multimodalMessageId += 1;

    const payload = sanitizeMultimodalResult(result);
    const riskMeta = getRiskMeta(payload.risk_assessment.level);

    const messageEl = document.createElement('div');
    messageEl.className = 'mm-message assistant';
    messageEl.setAttribute('data-mm-message-id', String(multimodalMessageId));

    messageEl.innerHTML = `
        <div class="mm-avatar">
            <img src="/assets/images/logo.png" alt="多模态助手">
        </div>
        <div class="mm-message-body">
            <div class="mm-message-status">${escapeHtml(statusText)}</div>
            <div class="mm-analysis-board">
                <div class="mm-card mm-scene-card">
                    <div class="mm-scene-preview">
                        <img src="${imageBase64}" alt="当前路况截图">
                    </div>
                    <div class="mm-scene-meta">
                        <div>
                            <div class="mm-kicker">${escapeHtml(payload.scene_overview.title)}</div>
                            <div class="mm-risk-title">${escapeHtml(riskMeta.title)}</div>
                        </div>
                        <span class="mm-risk-chip ${riskMeta.className}">${escapeHtml(riskMeta.label)}</span>
                        <button class="mm-scene-type-button" type="button" data-mm-detail="scene">
                            <span class="mm-scene-type-icon">${getSceneIconSvg(payload.scene_context.icon)}</span>
                            <span>
                                <span class="mm-scene-type-label">${escapeHtml(payload.scene_context.label)}</span>
                                <span class="mm-scene-type-hint">点击展开 </span>
                            </span>
                        </button>
                        <div class="mm-scene-detail" data-mm-detail-panel="scene">
                            <div class="mm-insight-markdown"></div>
                        </div>
                    </div>
                </div>

                <div class="mm-card mm-section-card">
                    <div class="mm-section-title">车辆统计</div>
                    <div class="mm-vehicle-list">
                        ${renderVehicleRows(payload.vehicle_statistics)}
                    </div>
                </div>

                <div class="mm-card mm-section-card">
                    <div class="mm-section-title">智能洞察</div>
                    ${renderInsightTiles(payload)}
                </div>
            </div>
        </div>
    `;

    outputEl.appendChild(messageEl);
    bindInsightButtons(messageEl, payload);
    trimMultimodalHistory(outputEl);
    outputEl.scrollTop = outputEl.scrollHeight;
}



function saveDronesState() {
    const connectedMap = {};
    document.querySelectorAll('.drone-item').forEach(item => {
        const id = item.getAttribute('data-id');
        const isOffline = item.querySelector('.status-dot').classList.contains('offline');
        if (!isOffline) {
            connectedMap[id] = {
                statusText: item.querySelector('.drone-status').textContent,
                task: item.getAttribute('data-task') || '巡检模式'
            };
        }
    });
    localStorage.setItem('omni_connected_drones', JSON.stringify(connectedMap));
}

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

function bindMultiModeBtn() {
    const btn = document.getElementById('multiModeBtn');
    btn.addEventListener('click', () => {
        isMultiMode = !isMultiMode;
        const checkboxes = document.querySelectorAll('.drone-checkbox');
        
        if (isMultiMode) {
            btn.textContent = '退出分屏';
            btn.classList.add('active');
            checkboxes.forEach(cb => cb.style.display = 'inline-block'); 
        } else {
            btn.textContent = '开启分屏';
            btn.classList.remove('active');
            checkboxes.forEach(cb => {
                cb.style.display = 'none'; 
                cb.checked = false;        
            });
            selectedDrones = []; 
            renderVideoGrid();   
        }
    });
}

function bindDroneItems() {
    const droneItems = document.querySelectorAll('.drone-item');
    
    droneItems.forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.settings-btn')) return;

            if (item.querySelector('.status-dot').classList.contains('offline')) {
                showCustomAlert('该无人机当前离线，请先通过设置面板连接设备！', 'warning');
                return;
            }

            const id = item.getAttribute('data-id');
            const name = item.getAttribute('data-name');

            if (isMultiMode) {
                const checkbox = item.querySelector('.drone-checkbox');
                checkbox.checked = !checkbox.checked;
                handleCheckboxChange(checkbox, id, name);
            } else {
                document.querySelectorAll('.drone-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                
                currentSingleDroneId = id;
                localStorage.setItem('omni_current_single_drone', id); 
                closeSettingsPanel(); 
                refreshAllVideos();
            }
        });
    });
}

function handleCheckboxChange(checkbox, id, name) {
    if (checkbox.checked) {
        if (selectedDrones.length >= 4) {
            showCustomAlert('最多只能选择 4 台无人机进行分屏监控！', 'warning');
            checkbox.checked = false; 
            return;
        }
        selectedDrones.push({ id, name });
    } else {
        selectedDrones = selectedDrones.filter(drone => drone.id !== id);
    }
    renderVideoGrid();
}

function bindSettingsGear() {
    document.querySelectorAll('.settings-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const droneItem = btn.closest('.drone-item');
            const id = droneItem.getAttribute('data-id');
            const name = droneItem.getAttribute('data-name');
            openSettingsPanel(id, name, droneItem);
        });
    });
}

function openSettingsPanel(droneId, droneName, droneItem) {
    currentSettingsDroneId = droneId;
    document.body.classList.add('uav-settings-open');
    
    document.getElementById('video-wrapper').style.display = 'none';
    document.getElementById('video-controls-bar').style.display = 'none';
    const settingsPanel = document.getElementById('settings-panel');
    settingsPanel.style.display = 'flex';
    settingsPanel.scrollTop = 0;
    
    document.getElementById('settings-title').textContent = `${droneName} - 设备高级设置`;

    if (!droneConfigStore[droneId]) {
        droneConfigStore[droneId] = getDefaultDroneConfig();
    }
    const config = droneConfigStore[droneId];

    document.getElementById('set-rgb-url').value = config.rgbUrl;
    document.getElementById('set-ir-url').value = config.irUrl;
    
    const autoAlignToggle = document.getElementById('set-align-auto');
    autoAlignToggle.checked = config.alignAuto;
    document.getElementById('set-align-text').textContent = config.alignAuto ? '自动' : '手动';
    document.getElementById('set-align-manual-box').style.display = config.alignAuto ? 'none' : 'block';
    
    document.getElementById('set-align-x').value = config.alignX;
    document.getElementById('set-align-y').value = config.alignY;
    
    document.getElementById('set-rgb-enhance').checked = config.rgbEnhance;
    document.getElementById('set-ir-enhance').checked = config.irEnhance;
    document.getElementById('set-latency-opt').checked = config.latencyOpt;
    document.getElementById('set-frame-drop').value = config.frameDrop;
    
    document.getElementById('set-box-color').value = config.boxColor;
    document.getElementById('set-box-thick').value = config.boxThick;
    document.getElementById('set-show-angle').checked = config.showAngle;
    document.getElementById('set-show-class').checked = config.showClass;
    document.getElementById('set-ir-color').value = config.irColorMode;
    document.getElementById('set-show-track').checked = config.showTrack;
    document.getElementById('set-model-select').value = config.model;
    updateModelOptionsState();

    const connectBtn = document.getElementById('btn-action-connect');
    const isOffline = droneItem.querySelector('.status-dot').classList.contains('offline');
    if (isOffline) {
        connectBtn.textContent = '连接设备';
        connectBtn.className = 'action-btn connect-btn';
    } else {
        connectBtn.textContent = '断开连接';
        connectBtn.className = 'action-btn disconnect-btn';
    }

    if (window.matchMedia('(max-width: 820px)').matches) {
        window.setTimeout(() => {
            settingsPanel.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }, 30);
    }
}

function closeSettingsPanel() {
    document.body.classList.remove('uav-settings-open');
    document.getElementById('settings-panel').style.display = 'none';
    document.getElementById('video-wrapper').style.display = 'flex';
    document.getElementById('video-controls-bar').style.display = 'flex';
    currentSettingsDroneId = null;
    refreshAllVideos(); 
}

function bindSettingsPanel() {
    document.getElementById('closeSettingsBtn').addEventListener('click', closeSettingsPanel);

    const panel = document.getElementById('settings-panel');
    panel.addEventListener('change', (e) => {
        if (!currentSettingsDroneId) return;
        const config = droneConfigStore[currentSettingsDroneId];
        const t = e.target;

        if (t.id === 'set-rgb-url') config.rgbUrl = t.value;
        if (t.id === 'set-ir-url') config.irUrl = t.value;
        if (t.id === 'set-align-auto') {
            config.alignAuto = t.checked;
            document.getElementById('set-align-text').textContent = t.checked ? '自动' : '手动';
            document.getElementById('set-align-manual-box').style.display = t.checked ? 'none' : 'block';
        }
        if (t.id === 'set-align-x') config.alignX = t.value;
        if (t.id === 'set-align-y') config.alignY = t.value;
        if (t.id === 'set-rgb-enhance') config.rgbEnhance = t.checked;
        if (t.id === 'set-ir-enhance') config.irEnhance = t.checked;
        if (t.id === 'set-latency-opt') config.latencyOpt = t.checked;
        if (t.id === 'set-frame-drop') config.frameDrop = t.value;
        if (t.id === 'set-box-color') config.boxColor = t.value;
        if (t.id === 'set-box-thick') config.boxThick = t.value;
        if (t.id === 'set-show-angle') config.showAngle = t.checked;
        if (t.id === 'set-show-class') config.showClass = t.checked;
        if (t.id === 'set-ir-color') config.irColorMode = t.value;
        if (t.id === 'set-show-track') config.showTrack = t.checked;
        if (t.id === 'set-model-select') config.model = t.value;
    });

    panel.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!currentSettingsDroneId) return;
            const droneItem = document.querySelector(`.drone-item[data-id="${currentSettingsDroneId}"]`);
            const action = btn.getAttribute('data-action');
            
            if (btn.id === 'btn-action-connect') {
                executeDroneCommand(droneItem, 'connect', btn);
            } else {
                executeDroneCommand(droneItem, action, btn);
            }
        });
    });
}

function executeDroneCommand(item, action, btnElement) {
    const id = item.getAttribute('data-id');
    const dot = item.querySelector('.status-dot');
    const nameEl = item.querySelector('.drone-name');
    const statusEl = item.querySelector('.drone-status');

    if (action === 'connect') {
        if (id === 'drone_05') {
            showCustomAlert('连接失败：无人机 05 号无法响应或不在服务区。', 'error');
            return;
        }

        const isOffline = dot.classList.contains('offline');
        if (isOffline) {
            dot.classList.remove('offline');
            nameEl.style.color = '#f8fafc';
            const initAlt = Math.floor(Math.random() * 50) + 50;
            const initBat = Math.floor(Math.random() * 40) + 60;
            
            statusEl.textContent = `高度: ${initAlt}m | 电量: ${initBat}% | 巡检模式`;
            item.setAttribute('data-task', '巡检模式');
            
            if(btnElement) {
                btnElement.textContent = '断开连接';
                btnElement.className = 'action-btn disconnect-btn';
            }
            showCustomAlert('设备连接成功！', 'info');
        } else {
            dot.classList.add('offline');
            nameEl.style.color = '#94a3b8';
            statusEl.textContent = '状态: 离线未连接';
            item.setAttribute('data-task', '');
            
            if(btnElement) {
                btnElement.textContent = '连接设备';
                btnElement.className = 'action-btn connect-btn';
            }

            const cb = item.querySelector('.drone-checkbox');
            if (cb && cb.checked) {
                cb.checked = false;
                handleCheckboxChange(cb, id, item.getAttribute('data-name'));
            }
            showCustomAlert('已断开设备连接。', 'warning');
        }
        
        saveDronesState(); 
        refreshAllVideos();
        return;
    }

    if (dot.classList.contains('offline')) {
        showCustomAlert('操作失败：请先连接该无人机！', 'error');
        return;
    }

    let modeText = '';
    if (action === 'rth') modeText = '返航中';
    if (action === 'inspect') modeText = '巡检模式';
    if (action === 'recon') modeText = '侦察模式';

    const statusParts = statusEl.textContent.split('|');
    if (statusParts.length >= 2) {
        statusEl.textContent = `${statusParts[0].trim()} | ${statusParts[1].trim()} | ${modeText}`;
    }
    
    item.setAttribute('data-task', modeText);
    showCustomAlert(`已下发指令：${modeText}`, 'info');
    saveDronesState();
}

function renderVideoGrid() {
    const gridContainer = document.getElementById('video-grid');
    gridContainer.innerHTML = ''; 
    
    if (selectedDrones.length === 0) {
        gridContainer.className = 'video-grid grid-1';
        gridContainer.innerHTML = `
            <div class="video-box" id="default-video-box" data-drone-id="${currentSingleDroneId}">
                <div class="image-container-roi" style="position:absolute; top:0; left:0; width:100%; height:100%; display:none; transform-origin: 0 0; transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); z-index: 2;">
                    <img class="static-img-roi" style="width:100%; height:100%; object-fit:fill;" src="" alt="Drone Image">
                </div>
                <div class="selection-box-roi" style="position: absolute; border: 2px dashed #38bdf8; background: rgba(56, 189, 248, 0.2); display: none; z-index: 100; pointer-events: none;"></div>

                <video class="local-video" loop muted autoplay></video>
                <div class="video-placeholder" id="video-text">画面加载中...</div>
                <canvas id="detection-canvas"></canvas>
                ${buildHudHtml(currentSingleDroneId)}
            </div>
        `;
        document.querySelectorAll('.video-box').forEach(box => bindROIZoom(box));
        refreshAllVideos(); 
        return;
    }

    const count = selectedDrones.length;
    gridContainer.className = `video-grid grid-${count}`;

    selectedDrones.forEach(drone => {
        const videoBox = document.createElement('div');
        videoBox.className = 'video-box';
        videoBox.setAttribute('data-drone-id', drone.id);
        videoBox.innerHTML = `
            <div class="image-container-roi" style="position:absolute; top:0; left:0; width:100%; height:100%; display:none; transform-origin: 0 0; transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); z-index: 2;">
                <img class="static-img-roi" style="width:100%; height:100%; object-fit:fill;" src="" alt="Drone Image">
            </div>
            <div class="selection-box-roi" style="position: absolute; border: 2px dashed #38bdf8; background: rgba(56, 189, 248, 0.2); display: none; z-index: 100; pointer-events: none;"></div>
            <video class="local-video" loop muted autoplay></video>
            <div class="video-label">${drone.name}</div>
            <div class="video-placeholder">画面加载中...</div>
            <canvas id="detection-canvas"></canvas>
            ${buildHudHtml(drone.id)}
        `;
        gridContainer.appendChild(videoBox);
        bindROIZoom(videoBox);
    });

    refreshAllVideos(); 
}

function bindVideoModeMenu() {
    const btn = document.getElementById('modeBtn');
    const menu = document.getElementById('modeMenu');

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && e.target !== btn) {
            menu.classList.remove('show');
        }
    });

    const options = menu.querySelectorAll('div');
    options.forEach(opt => {
        opt.addEventListener('click', () => {
            currentMode = opt.getAttribute('data-mode');
            btn.innerHTML = `${opt.textContent} ▼`;
            menu.classList.remove('show');
            switchVideoMode(currentMode);
        });
    });
}

function switchVideoMode(mode) {
    localStorage.setItem('omni_video_mode', mode);
    refreshAllVideos();
}

function getVideoPath(droneId, mode) {
    const videoMap = {
        'drone_01': { 'RGB': 'Video/无人机01号/rgb_video.mp4', 'IR': 'Video/无人机01号/ir_video.mp4', 'Enhance': 'Video/无人机01号/rgb_video.mp4' },
        'drone_02': { 'RGB': 'Video/无人机02号/rgb_video.mp4', 'IR': 'Video/无人机02号/ir_video.mp4', 'Enhance': 'Video/无人机02号/rgb_video.mp4' },
        'drone_03': { 'RGB': 'Video/无人机03号/rgb_video.mp4', 'IR': 'Video/无人机03号/ir_video.mp4', 'Enhance': 'Video/无人机03号/rgb_video.mp4' },
        'drone_04': { 'RGB': 'Video/无人机04号/rgb_video.mp4', 'IR': 'Video/无人机04号/ir_video.mp4', 'Enhance': 'Video/无人机04号/rgb_video.mp4' }
    };
    if (videoMap[droneId] && videoMap[droneId][mode]) return videoMap[droneId][mode];
    return null; 
}

function getTrackJsonPath(droneId, mode, isSemiOn) {
    if (droneId !== 'drone_02' && droneId !== 'drone_03') return null;
    if (mode === 'IR') return null;
    const baseDir = droneId === 'drone_03' ? 'Video/无人机03号' : 'Video/无人机02号';
    return isSemiOn
        ? `${baseDir}/rgb_ai_track_high.json`
        : `${baseDir}/rgb_ai_track_low.json`;
}

async function loadTrackData(trackPath) {
    if (!trackPath) return null;
    if (Object.prototype.hasOwnProperty.call(droneTrackCache, trackPath)) {
        return droneTrackCache[trackPath];
    }

    try {
        const response = await fetch(trackPath);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        droneTrackCache[trackPath] = data;
        return data;
    } catch (error) {
        console.error(`轨迹文件加载失败: ${trackPath}`, error);
        droneTrackCache[trackPath] = null;
        return null;
    }
}

function ensureDroneTrackState(droneId) {
    if (!droneTrackState[droneId]) {
        droneTrackState[droneId] = { path: null, data: null };
    }
    return droneTrackState[droneId];
}

function clearDetectionCanvas(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.clientWidth || canvas.width || 0;
    const height = canvas.clientHeight || canvas.height || 0;
    if (width) canvas.width = width;
    if (height) canvas.height = height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function syncDetectionCanvasSize(canvas, videoEl) {
    if (!canvas || !videoEl) return;
    const width = videoEl.clientWidth || canvas.clientWidth || 0;
    const height = videoEl.clientHeight || canvas.clientHeight || 0;
    if (!width || !height) return;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
}

async function configureDroneTrack(box, droneId, mode, isSemiOn) {
    const canvas = box.querySelector('canvas');
    const state = ensureDroneTrackState(droneId);
    const trackPath = getTrackJsonPath(droneId, mode, isSemiOn);

    if (!canvas || !trackPath) {
        state.path = null;
        state.data = null;
        clearDetectionCanvas(canvas);
        return;
    }

    if (state.path === trackPath && state.data) return;

    state.path = trackPath;
    state.data = await loadTrackData(trackPath);
    if (!state.data) {
        clearDetectionCanvas(canvas);
    }
}

function getTrackFrameDetections(trackData, videoEl) {
    if (!trackData || !videoEl) return [];
    const fps = Number(trackData.fps || 30);
    const frames = trackData.frames || {};
    const frameIndex = Math.max(0, Math.floor((videoEl.currentTime || 0) * fps));
    return frames[String(frameIndex)] || frames[frameIndex] || [];
}

function getTrackSourceSize(trackData) {
    return {
        sourceWidth: Number(trackData?.width || trackData?.sourceWidth || 1920),
        sourceHeight: Number(trackData?.height || trackData?.sourceHeight || 1080)
    };
}

function getObjectFitCoverMetrics(containerWidth, containerHeight, sourceWidth, sourceHeight) {
    const safeSourceWidth = Number(sourceWidth) || 1920;
    const safeSourceHeight = Number(sourceHeight) || 1080;
    const safeContainerWidth = Number(containerWidth) || 0;
    const safeContainerHeight = Number(containerHeight) || 0;
    if (!safeContainerWidth || !safeContainerHeight) {
        return { scale: 1, offsetX: 0, offsetY: 0, renderedWidth: safeSourceWidth, renderedHeight: safeSourceHeight };
    }

    const scale = Math.max(safeContainerWidth / safeSourceWidth, safeContainerHeight / safeSourceHeight);
    const renderedWidth = safeSourceWidth * scale;
    const renderedHeight = safeSourceHeight * scale;
    return {
        scale,
        renderedWidth,
        renderedHeight,
        offsetX: (safeContainerWidth - renderedWidth) / 2,
        offsetY: (safeContainerHeight - renderedHeight) / 2
    };
}

function getTrackVisualStyle(trackPath) {
    const isHighPrecision = /_high\.json$/i.test(trackPath || '');
    return {
        boxColor: isHighPrecision ? '#22c55e' : '#ef4444',
        badgeText: isHighPrecision ? 'OmniAero-Semi' : 'OmniAeo-edge-o1'
    };
}

function drawTrackOverlay(canvas, videoEl, trackData, droneId) {
    if (!canvas || !videoEl || !trackData) return;
    if (droneId !== 'drone_02' && droneId !== 'drone_03') return;
    if (videoEl.paused || videoEl.ended || videoEl.readyState < 2) return;

    syncDetectionCanvasSize(canvas, videoEl);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const detections = getTrackFrameDetections(trackData, videoEl);
    if (!detections.length) return;

    const { sourceWidth, sourceHeight } = getTrackSourceSize(trackData);
    const fit = getObjectFitCoverMetrics(canvas.width, canvas.height, sourceWidth, sourceHeight);
    const visualStyle = getTrackVisualStyle(ensureDroneTrackState(droneId).path);

    ctx.textBaseline = 'top';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.clip();

    detections.forEach((item) => {
        const label = item.label || 'Vehicle';
        const confText = typeof item.conf === 'number' ? `${Math.round(item.conf * 100)}%` : '';
        const [x, y, w, h] = Array.isArray(item.box) ? item.box : [0, 0, 0, 0];
        const drawX = x * fit.scale + fit.offsetX;
        const drawY = y * fit.scale + fit.offsetY;
        const drawW = w * fit.scale;
        const drawH = h * fit.scale;
        const color = visualStyle.boxColor;
        const text = `${label} ${confText} ${visualStyle.badgeText}`.trim();

        if (drawX + drawW < 0 || drawY + drawH < 0 || drawX > canvas.width || drawY > canvas.height) {
            return;
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX, drawY, drawW, drawH);

        const textWidth = Math.min(ctx.measureText(text).width + 10, canvas.width - 8);
        const textHeight = 18;
        const textX = Math.max(4, Math.min(drawX, canvas.width - textWidth - 4));
        const textY = Math.max(4, Math.min(drawY > textHeight ? drawY - textHeight : drawY + 2, canvas.height - textHeight - 4));

        ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
        ctx.fillRect(textX, textY, textWidth, textHeight);

        ctx.fillStyle = color;
        ctx.fillText(text, textX + 5, textY + 3);
    });

    ctx.restore();
}

// 🚨 核心逻辑：拦截无人机01号展现单图架构
function refreshAllVideos() {
    const videoBoxes = document.querySelectorAll('.video-box');
    const onlineCount = document.querySelectorAll('.drone-item .status-dot:not(.offline)').length;
    
    videoBoxes.forEach(box => {
        const videoEl = box.querySelector('.local-video');
        const placeholderEl = box.querySelector('.video-placeholder');
        const hudEl = box.querySelector('.drone-hud'); 
        const imgContainer = box.querySelector('.image-container-roi');
        const imgEl = box.querySelector('.static-img-roi');
        const canvas = box.querySelector('canvas');
        
        let droneId = isMultiMode ? box.getAttribute('data-drone-id') : currentSingleDroneId;
        if (!droneId) droneId = currentSingleDroneId; 

        const droneItem = document.querySelector(`.drone-item[data-id="${droneId}"]`);
        const isOffline = droneItem ? droneItem.querySelector('.status-dot').classList.contains('offline') : true;

        const videoPath = getVideoPath(droneId, currentMode);
        const isSemiOn = localStorage.getItem('omni_semi_enabled') === 'true'; 

        if (!isOffline && droneId === 'drone_01') {
            // == 无人机01专属展示逻辑 ==
            if(videoEl) {
                videoEl.style.display = 'none';
                videoEl.pause();
            }
            if(canvas) {
                canvas.style.display = 'none';
                clearDetectionCanvas(canvas);
            }
            
            if(imgContainer) imgContainer.style.display = 'block';
            if(imgEl) {
                imgEl.src = isSemiOn ? 'Video/无人机01号/test1.png' : 'Video/无人机01号/test.png';
            }
            if (placeholderEl) placeholderEl.style.display = 'none'; 
            if (hudEl) hudEl.style.display = 'block';

        } else if (videoPath && !isOffline) {
            // == 原有视频逻辑 ==
            if(imgContainer) imgContainer.style.display = 'none';
            if(canvas) {
                const shouldShowTrack = (droneId === 'drone_02' || droneId === 'drone_03') && currentMode !== 'IR';
                canvas.style.display = shouldShowTrack ? 'block' : 'none';
                if (!shouldShowTrack) clearDetectionCanvas(canvas);
            }
            configureDroneTrack(box, droneId, currentMode, isSemiOn);

            const currentTime = videoEl.currentTime || 0;
            videoEl.src = videoPath;
            videoEl.style.display = 'block';     
            if (placeholderEl) placeholderEl.style.display = 'none'; 
            if (hudEl) hudEl.style.display = 'block';

            videoEl.load();
            videoEl.onloadedmetadata = () => {
                videoEl.currentTime = currentTime; 
                videoEl.play().catch(e => console.log('自动播放失败:', e));
                bindVideoTimeSync(videoEl, droneId);
            };
        } else {
            // == 离线表现 ==
            if(imgContainer) imgContainer.style.display = 'none';
            if(videoEl) {
                videoEl.style.display = 'none'; 
                videoEl.pause();
            }
            if (canvas) {
                canvas.style.display = 'none';
                clearDetectionCanvas(canvas);
            }
            if(placeholderEl) placeholderEl.style.display = 'block'; 
            if (hudEl) hudEl.style.display = 'none';
            
            if (onlineCount === 0) {
                if(placeholderEl) {
                    placeholderEl.textContent = '当前未连接任何无人机';
                    placeholderEl.style.color = '#94a3b8'; 
                }
            } else {
                if(placeholderEl) {
                    const textBase = getDroneDisplayName(droneId);
                    placeholderEl.textContent = `[无信号 / 未连接] ${textBase} [${getModeText()}]`;
                    placeholderEl.style.color = '#ef4444'; 
                }
            }
        }
    });

    syncHudInfo();
}

function getModeText() {
    if (currentMode === 'RGB') return 'RGB模式';
    if (currentMode === 'IR') return 'IR模式';
    if (currentMode === 'Enhance') return '图像增强模式';
    return 'RGB模式';
}

function bindVideoTimeSync(videoEl, droneId) {
    if (!videoEl || !droneId) return;
    videoEl.ontimeupdate = () => {
        localStorage.setItem(`omni_video_time_${droneId}`, videoEl.currentTime.toString());
        localStorage.setItem(`omni_video_time_updated_at_${droneId}`, Date.now().toString());
    };
}

function getDroneDisplayName(droneId) {
    const item = document.querySelector(`.drone-item[data-id="${droneId}"]`);
    if (!item) return '未知无人机';
    const baseName = item.getAttribute('data-name');
    const task = item.getAttribute('data-task');
    return task ? `${baseName} - ${task}` : baseName;
}

function getDroneStatusText(droneId) {
    const status = document.querySelector(`.drone-item[data-id="${droneId}"] .drone-status`);
    return status ? status.textContent.trim() : '状态: 离线未连接';
}

function getDroneFlightMetrics(droneId) {
    const statusText = getDroneStatusText(droneId);
    const altMatch = statusText.match(/高度[:：]\s*(\d+)m/i);
    const batteryMatch = statusText.match(/电量[:：]\s*(\d+)%/i);
    return {
        altitude: altMatch ? `${altMatch[1]}m` : '--m',
        battery: batteryMatch ? `${batteryMatch[1]}%` : '--%'
    };
}

function buildHudHtml(droneId) {
    const displayName = getDroneDisplayName(droneId);
    const { altitude, battery } = getDroneFlightMetrics(droneId);
    const speed = `${Math.floor(Math.random() * 8) + 8}m/s`;

    return `
        <div class="drone-hud">
            <div class="hud-top-bar">
                <span class="hud-drone-name">${displayName}</span>
                <span class="hud-mode">${getModeText()}</span>
            </div>
            <div class="hud-center-reticle">
                <span class="reticle-h"></span>
                <span class="reticle-v"></span>
                <span class="reticle-dot"></span>
            </div>
            <div class="hud-corners">
                <span class="corner tl"></span><span class="corner tr"></span>
                <span class="corner bl"></span><span class="corner br"></span>
            </div>
            <div class="hud-bottom-bar">
                <span class="hud-alt">ALT ${altitude}</span>
                <span class="hud-speed">SPD ${speed}</span>
                <span class="hud-battery">BAT ${battery}</span>
                <span class="hud-time">--:--:--</span>
            </div>
        </div>
    `;
}

function syncHudInfo() {
    const now = new Date();
    const timeText = now.toTimeString().slice(0, 8);

    document.querySelectorAll('.video-box').forEach(box => {
        const droneId = box.getAttribute('data-drone-id') || currentSingleDroneId;
        const modeEl = box.querySelector('.hud-mode');
        if (modeEl) modeEl.textContent = getModeText();
        const nameEl = box.querySelector('.hud-drone-name');
        if (nameEl) nameEl.textContent = getDroneDisplayName(droneId);

        const statusText = getDroneStatusText(droneId);
        const altMatch = statusText.match(/高度[:：]\s*(\d+)m/i);
        const batteryMatch = statusText.match(/电量[:：]\s*(\d+)%/i);
        const isOffline = statusText.includes('离线');

        const altEl = box.querySelector('.hud-alt');
        if (altEl) altEl.textContent = `ALT ${altMatch ? `${altMatch[1]}m` : '--m'}`;
        const batEl = box.querySelector('.hud-battery');
        if (batEl) batEl.textContent = `BAT ${batteryMatch ? `${batteryMatch[1]}%` : '--%'}`;

        const speedEl = box.querySelector('.hud-speed');
        if (speedEl) {
            const speedValue = isOffline ? 0 : Math.floor(Math.random() * 8) + 8;
            speedEl.textContent = `SPD ${speedValue}m/s`;
        }

        const timeEl = box.querySelector('.hud-time');
        if (timeEl) timeEl.textContent = timeText;
    });
}

setInterval(syncHudInfo, 1000);

// 🚨 核心跨越交互逻辑：绑定图片画面的 ROI 框选放大
function bindROIZoom(box) {
    if (box.dataset.roiBound) return;
    box.dataset.roiBound = 'true';

    const selection = box.querySelector('.selection-box-roi');
    const container = box.querySelector('.image-container-roi');
    if (!selection || !container) return;

    let startX, startY, isDragging = false;

    // 鼠标按下：确立定点
    box.addEventListener('mousedown', (e) => {
        const droneId = box.getAttribute('data-drone-id') || currentSingleDroneId;
        if (droneId !== 'drone_01' || container.style.display === 'none') return;
        
        isDragging = true;
        const rect = box.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;

        selection.style.left = startX + 'px';
        selection.style.top = startY + 'px';
        selection.style.width = '0';
        selection.style.height = '0';
        selection.style.display = 'block';
        e.preventDefault(); 
    });

    // 鼠标移动：绘制虚线框
    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const rect = box.getBoundingClientRect();
        let curX = e.clientX - rect.left;
        let curY = e.clientY - rect.top;

        curX = Math.max(0, Math.min(curX, rect.width));
        curY = Math.max(0, Math.min(curY, rect.height));

        const width = curX - startX;
        const height = curY - startY;

        selection.style.width = Math.abs(width) + 'px';
        selection.style.height = Math.abs(height) + 'px';
        selection.style.left = (width > 0 ? startX : curX) + 'px';
        selection.style.top = (height > 0 ? startY : curY) + 'px';
    });

    // 鼠标松开：执行过渡动画放大
    window.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        
        const selW = parseFloat(selection.style.width);
        const selH = parseFloat(selection.style.height);

        // 如果框选面积足够大，执行缩放算法
        if (selW > 20 && selH > 20) {
            applyZoom(box, container, parseFloat(selection.style.left), parseFloat(selection.style.top), selW, selH);
        }
        selection.style.display = 'none';
    });

    // 双击画面：重置缩放比例到最初状态
    box.addEventListener('dblclick', () => {
        const droneId = box.getAttribute('data-drone-id') || currentSingleDroneId;
        if (droneId === 'drone_01') {
            container.style.transform = `translate(0, 0) scale(1)`;
        }
    });
    
    // 鼠标样式变换：提示可以进行截取
    box.addEventListener('mouseenter', () => {
        const droneId = box.getAttribute('data-drone-id') || currentSingleDroneId;
        if (droneId === 'drone_01' && container.style.display !== 'none') {
            box.style.cursor = 'crosshair';
        } else {
            box.style.cursor = 'default';
        }
    });
}

// 缩放底层算法 (Scale + Translate平移对齐)
function applyZoom(box, container, selX, selY, selW, selH) {
    const rect = box.getBoundingClientRect();
    const scaleX = rect.width / selW;
    const scaleY = rect.height / selH;
    const scale = Math.min(scaleX, scaleY);

    const translateX = -selX * scale;
    const translateY = -selY * scale;

    container.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
}
//以下是将图片传给多模态模型
function getCurrentDroneBox() {
    if (isMultiMode) return null;
    return document.querySelector(`.video-box[data-drone-id="${currentSingleDroneId}"]`) || document.querySelector('.video-box');
}

function captureCurrentDroneFrame() {
    const box = getCurrentDroneBox();
    if (!box) return null;

    const videoEl = box.querySelector('.local-video');
    const imgEl = box.querySelector('.static-img-roi');
    const imgContainer = box.querySelector('.image-container-roi');
    const detectionCanvas = box.querySelector('canvas');

    const width = 640;
    const height = 360;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const showingImage = imgContainer && imgContainer.style.display !== 'none' && imgEl && imgEl.src;
    const showingVideo = videoEl && videoEl.style.display !== 'none';

    try {
        if (showingImage) {
            ctx.drawImage(imgEl, 0, 0, width, height);
        } else if (showingVideo && videoEl.readyState >= 2) {
            ctx.drawImage(videoEl, 0, 0, width, height);
        } else {
            return null;
        }

        if (detectionCanvas && detectionCanvas.style.display !== 'none') {
            ctx.drawImage(detectionCanvas, 0, 0, width, height);
        }

        const dataUrl = canvas.toDataURL('image/jpeg', 0.58);
        console.log('multimodal image size (chars):', dataUrl.length);
        return dataUrl;
    } catch (err) {
        console.error('captureCurrentDroneFrame failed:', err);
        return null;
    }
}



//前端接入后端多模态接口
async function requestMultimodalAnalysis(eventType = 'manual_detect') {
    if (multimodalAnalyzing) return;

    const imageBase64 = captureCurrentDroneFrame();
    if (!imageBase64) {
        setMultimodalStatus('当前画面暂不可分析');
        return;
    }

    if (imageBase64.length > 4 * 1024 * 1024) {
        setMultimodalStatus('分析图片过大，已跳过本轮请求');
        return;
    }

    multimodalAnalyzing = true;
    multimodalLastFrame = imageBase64;
    setMultimodalStatus('正在检测当前路况...');

    const pendingMessage = appendAssistantPending('正在检测...', '正在载入当前图片帧并分析路况...');

    try {
        const token = localStorage.getItem('token') || '';
        const res = await fetch('/api/multimodal/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
                droneId: currentSingleDroneId,
                mode: currentMode,
                timestamp: new Date().toISOString(),
                eventType,
                imageBase64
            })
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        const structured = sanitizeMultimodalResult(data.structured || {});
        multimodalLastResult = structured;

        if (pendingMessage) {
            pendingMessage.remove();
        }

        appendAnalysisCard(structured, imageBase64, '检测完成');
        setMultimodalStatus('检测完成');
    } catch (err) {
        console.error('multimodal analyze failed:', err);

        setMultimodalStatus('当前检测暂时不可用');

        if (pendingMessage) {
            replacePendingWithAssistantText(
                pendingMessage,
                '检测失败',
                '当前检测暂时不可用，请稍后重试或检查模型连接状态。'
            );
        }
    } finally {
        multimodalAnalyzing = false;
    }
}
async function requestMultimodalFollowup(question) {
    const text = String(question || '').trim();
    if (!text || multimodalChatBusy) return;

    if (!multimodalLastResult) {
        setMultimodalStatus('请先进行一次自动检测');
        appendAssistantPending('需要先检测', '请先点击“自动检测”，生成当前路况分析后再继续追问。');
        return;
    }

    multimodalChatBusy = true;
    setMultimodalStatus('正在回答追问...');

    appendUserMessage(text);

    const pendingMessage = appendAssistantPending('正在思考...', '正在结合上一轮检测结果生成回答...');

    try {
        const token = localStorage.getItem('token') || '';
        const res = await fetch('/api/multimodal/followup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
                question: text,
                structured: multimodalLastResult,
                imageBase64: multimodalLastFrame || ''
            })
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        replacePendingWithAssistantText(
            pendingMessage,
            '回答完成',
            data.answer || '暂无回答。'
        );

        setMultimodalStatus('回答完成');
    } catch (err) {
        console.error('multimodal followup failed:', err);

        replacePendingWithAssistantText(
            pendingMessage,
            '回答失败',
            '当前追问暂时不可用，请稍后重试。'
        );

        setMultimodalStatus('当前追问暂时不可用');
    } finally {
        multimodalChatBusy = false;
    }
}




//自动分析机制
function startMultimodalLoop() {
}

function stopMultimodalLoop() {
    if (multimodalTimer) {
        clearInterval(multimodalTimer);
        multimodalTimer = null;
    }
}

// 结尾附带原始 Canvas 空渲染函数以避免未捕获异常
function renderAiCanvasLegacy() {
    document.querySelectorAll('.video-box').forEach((box) => {
        const droneId = isMultiMode ? box.getAttribute('data-drone-id') : currentSingleDroneId;
        if (droneId !== 'drone_02' && droneId !== 'drone_03') return;

        const videoEl = box.querySelector('.local-video');
        const canvas = box.querySelector('canvas');
        const state = ensureDroneTrackState(droneId);

        if (!canvas || !videoEl || canvas.style.display === 'none' || !state.data) return;

        drawTrackOverlay(canvas, videoEl, state.data, droneId);
    });

    requestAnimationFrame(renderAiCanvasLegacy);
}

// js/model.js
const MAP_EVENT_DETECTION_PAUSED_KEY = 'omni_pause_map_event_detection';

document.addEventListener('DOMContentLoaded', () => {
    bindSidebarToggle();
    bindMultiModelSelection();
    bindModelConfigSettings();
    bindConfigFormLogic();
    bindMapEventDetectionToggle();
    
    bindOmniSemiToggle(); // 🚨 新增：绑定云端大模型开关
    bindMapEventDetectionToggle();
});
// 1. 侧边栏菜单切换逻辑
function bindSidebarToggle() {
    const menuItems = document.querySelectorAll('.menu-item');
    const contentSections = document.querySelectorAll('.settings-content');

    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            menuItems.forEach(m => m.classList.remove('active'));
            contentSections.forEach(s => s.style.display = 'none');

            item.classList.add('active');
            const targetId = item.getAttribute('data-target');
            const targetContent = document.getElementById(targetId);
            
            if (targetContent) {
                targetContent.style.display = 'flex';
            }
        });
    });
}

// 2. 九宫格模型多选逻辑 (复选)
function bindMultiModelSelection() {
    const applyBtns = document.querySelectorAll('.apply-btn');

    applyBtns.forEach(btn => {
        btn.addEventListener('click', function(e) {
            const card = this.closest('.model-card');
            
            if (card.classList.contains('custom-card')) {
                showToast('即将打开本地文件目录...', 'info');
                return;
            }

            const badge = card.querySelector('.badge');
            const modelName = card.querySelector('.model-title').textContent;

            if (card.classList.contains('active-model')) {
                card.classList.remove('active-model');
                this.textContent = '加载此模型';
                badge.textContent = '可用';
                badge.classList.remove('in-use');
                showToast(`已卸载模型: ${modelName}`, 'info');
                updateModelStateInStorage(modelName, false);
            } else {
                card.classList.add('active-model');
                this.textContent = '已应用';
                badge.textContent = '当前启用';
                badge.classList.add('in-use');
                showToast(`成功加载模型: ${modelName}`, 'success');
                updateModelStateInStorage(modelName, true);
            }
        });
    });
}

// 更新模型状态到本地存储
function updateModelStateInStorage(modelName, isLoaded) {
    // 获取当前存储的模型状态
    let modelStates = JSON.parse(localStorage.getItem('omni_model_states') || '{}');
    modelStates[modelName] = isLoaded;
    localStorage.setItem('omni_model_states', JSON.stringify(modelStates));
    
    // 通知其他页面模型状态已更新
    window.dispatchEvent(new CustomEvent('modelStateChanged'));
}

// 3. 模型单独设置页面(齿轮图标)切换逻辑
function bindModelConfigSettings() {
    const gears = document.querySelectorAll('.gear-icon');
    const modelRepoPanel = document.getElementById('model-repo');
    const modelConfigPanel = document.getElementById('model-config-panel');
    const configTitle = document.getElementById('configPanelTitle');
    const btnBack = document.getElementById('btnBackToRepo');

    gears.forEach(gear => {
        gear.addEventListener('click', function(e) {
            e.stopPropagation(); 
            const card = this.closest('.model-card');
            const modelName = card.querySelector('.model-title').textContent;

            configTitle.textContent = `模型设置 - ${modelName}`;
            modelRepoPanel.style.display = 'none';
            modelConfigPanel.style.display = 'flex';
        });
    });

    if(btnBack) {
        btnBack.addEventListener('click', () => {
            modelConfigPanel.style.display = 'none';
            const activeSidebar = document.querySelector('.menu-item.active').getAttribute('data-target');
            if (activeSidebar === 'model-repo') {
                modelRepoPanel.style.display = 'flex';
            }
        });
    }
}

// 4. 模型设置表单内部动态联动及滚动条UI逻辑
function bindConfigFormLogic() {
    // A. 滚动条数值显示及【进度颜色填充】
    const ranges = ['confThresh', 'nmsThresh', 'batchSize', 'attnHeads', 'attnTemp'];
    ranges.forEach(id => {
        const input = document.getElementById(id);
        const display = document.getElementById(id + '-val');
        if (input && display) {
            // 初始化填充
            updateSliderProgress(input);
            
            input.addEventListener('input', (e) => {
                let val = parseFloat(e.target.value);
                if (id === 'confThresh' || id === 'nmsThresh') {
                    display.textContent = val.toFixed(2);
                } else if (id === 'attnTemp') {
                    display.textContent = val.toFixed(1);
                } else {
                    display.textContent = val;
                }
                updateSliderProgress(e.target);
            });
        }
    });

    // B. 融合模式选择 -> 控制【模态偏好】显隐
    const fusionMode = document.getElementById('fusionMode');
    const modalPrefRow = document.getElementById('modalPrefRow');
    if (fusionMode && modalPrefRow) {
        fusionMode.addEventListener('change', (e) => {
            if (e.target.value === 'auto') {
                modalPrefRow.style.display = 'flex';
            } else {
                modalPrefRow.style.display = 'none';
            }
        });
    }

    // C. 跨模态注意力开关 -> 控制【头数】【温度】显隐
    const attentionToggle = document.getElementById('attentionToggle');
    const attentionOptions = document.getElementById('attentionOptions');
    if (attentionToggle && attentionOptions) {
        attentionToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                attentionOptions.style.display = 'block';
            } else {
                attentionOptions.style.display = 'none';
            }
        });
    }
}

// 更新滚动条进度条颜色的核心方法
function updateSliderProgress(slider) {
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 100;
    const val = parseFloat(slider.value);
    const percent = ((val - min) / (max - min)) * 100;
    slider.style.background = `linear-gradient(to right, #38bdf8 ${percent}%, #334155 ${percent}%)`;
}

// 5. 仿系统级的 Toast 提示功能
let toastTimeout;
function showToast(message, type = 'success') {
    const toast = document.getElementById('toastMessage');
    toast.textContent = message;
    
    if (type === 'success') {
        toast.style.backgroundColor = '#22c55e'; // 绿色
    } else if (type === 'info') {
        toast.style.backgroundColor = '#3b82f6'; // 蓝色
    } else {
        toast.style.backgroundColor = '#ef4444'; // 红色
    }

    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}
function bindOmniSemiToggle() {
    const semiToggle = document.getElementById('omniAeroSemiToggle');
    if (semiToggle) {
        // 页面加载时，读取本地存储，恢复开关状态
        const isSemiEnabled = localStorage.getItem('omni_semi_enabled') === 'true';
        semiToggle.checked = isSemiEnabled;

        // 监听开关变化，存入本地存储
        semiToggle.addEventListener('change', (e) => {
            localStorage.setItem('omni_semi_enabled', e.target.checked);
            if (e.target.checked) {
                showToast('已接入 OmniAero-Semi模型', 'success');
            } else {
                showToast('已切回边缘端低功耗基础模型', 'info');
            }
        });
    }
}

window.setOmniAeroSemiEnabled = function(enable, options = {}) {
    const nextValue = Boolean(enable);
    const semiToggle = document.getElementById('omniAeroSemiToggle');
    localStorage.setItem('omni_semi_enabled', nextValue ? 'true' : 'false');

    if (semiToggle && semiToggle.checked !== nextValue) {
        semiToggle.checked = nextValue;
        if (!options.silent) {
            semiToggle.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    if (!options.silent && typeof showToast === 'function') {
        showToast(nextValue ? '已接入 OmniAero-Semi模型' : '已切回边缘端低功耗基础模型', nextValue ? 'success' : 'info');
    }

    return true;
};

function bindMapEventDetectionToggle() {
    const toggle = document.getElementById('pauseMapEventDetectionToggle');
    if (!toggle) return;

    toggle.checked = localStorage.getItem(MAP_EVENT_DETECTION_PAUSED_KEY) === 'true';

    toggle.addEventListener('change', (e) => {
        const paused = Boolean(e.target.checked);
        localStorage.setItem(MAP_EVENT_DETECTION_PAUSED_KEY, paused ? 'true' : 'false');
        showToast(
            paused ? '已暂停天眼GIS新的道路异常识别' : '已恢复天眼GIS道路异常识别',
            paused ? 'info' : 'success'
        );
    });
}

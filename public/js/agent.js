(function() {
    const AGENT_HISTORY_OPEN_CLASS = 'history-open';

    window.toggleAgent = function() {
        ensureAgentHistoryToggle();

        const panel = document.getElementById('agent-chat-panel');
        const triggerBtn = document.getElementById('agent-trigger-btn');
        const input = document.getElementById('agent-input');

        if (!panel || !triggerBtn) return;

        if (panel.classList.contains('collapsed')) {
            triggerBtn.classList.add('hidden');
            panel.classList.remove('collapsed');
            setTimeout(() => {
                if (input) input.focus();
            }, 260);
        } else {
            panel.classList.add('collapsed');
            panel.classList.remove(AGENT_HISTORY_OPEN_CLASS);
            triggerBtn.classList.remove('hidden');
        }
    };

    window.handleAgentInput = function(e) {
        if (e.key === 'Enter') window.sendAgentMsg();
    };

    window.sendAgentMsg = function() {
        ensureAgentHistoryToggle();

        const inputEl = document.getElementById('agent-input');
        const msg = inputEl ? inputEl.value.trim() : '';
        if (!msg) return;

        appendAgentMessage('user', msg);
        inputEl.value = '';

        const reply = runAgentCommand(msg);

        setTimeout(() => {
            appendAgentMessage('system', reply);
        }, 260);
    };

    function ensureAgentHistoryToggle() {
        const panel = document.getElementById('agent-chat-panel');
        const inputWrapper = panel ? panel.querySelector('.agent-input-wrapper') : null;
        const chatBody = document.getElementById('agent-chat-body');

        if (!panel || !inputWrapper || !chatBody) return;
        chatBody.classList.add('agent-chat-body');
        if (panel.querySelector('.agent-history-toggle')) return;

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'agent-history-toggle';
        toggle.setAttribute('aria-label', '展开历史对话');
        toggle.innerHTML = '<span class="agent-history-arrow">⌃</span>';

        toggle.addEventListener('click', () => {
            const isOpen = panel.classList.toggle(AGENT_HISTORY_OPEN_CLASS);
            if (isOpen) {
                panel.classList.remove('history-has-new');
            }
            toggle.setAttribute('aria-label', isOpen ? '收起历史对话' : '展开历史对话');
            chatBody.scrollTop = chatBody.scrollHeight;
        });

        panel.insertBefore(toggle, inputWrapper);
    }

    function appendAgentMessage(role, text) {
        ensureAgentHistoryToggle();

        const panel = document.getElementById('agent-chat-panel');
        const chatBody = document.getElementById('agent-chat-body');
        if (!chatBody) return;

        const div = document.createElement('div');
        div.className = role === 'user' ? 'agent-msg user' : 'agent-msg system';
        div.innerText = `${role === 'user' ? 'YOU' : 'AGENT'}: ${text}`;
        chatBody.appendChild(div);
        chatBody.scrollTop = chatBody.scrollHeight;

        if (panel && !panel.classList.contains(AGENT_HISTORY_OPEN_CLASS)) {
            panel.classList.add('history-has-new');
        }
    }

    function runAgentCommand(rawText) {
        const text = String(rawText || '').trim().toLowerCase();

        if (/帮助|能做什么|指令/.test(text)) {
            return [
                '我现在可以执行这些指令：',
                '1. 打开地图 / 打开数据中心 / 打开模型设置 / 回到无人机页面',
                '2. 连接1号无人机 / 断开1号无人机',
                '3. 1号返航 / 1号巡检 / 1号侦察',
                '4. 切换RGB / 切换红外 / 开启图像增强',
                '5. 开启分屏 / 退出分屏',
                '6. 打开多模态助手 / 自动检测当前路况',
                '7. 开启Semi模型 / 关闭Semi模型'
            ].join('\n');
        }

        if (/地图|gis|天眼/.test(text)) {
            location.href = 'map.html';
            return '正在打开天眼 GIS 页面。';
        }

        if (/数据中心|数据/.test(text)) {
            location.href = 'datacenter.html';
            return '正在打开数据中心。';
        }

        if (/模型设置|模型页面|模型/.test(text)) {
            location.href = 'settings.html';
            return '正在打开模型设置页面。';
        }

        if (/无人机页面|监控页面|回到无人机/.test(text)) {
            location.href = 'user.html';
            return '正在回到无人机监控页面。';
        }

        if (/红外|ir/.test(text)) {
            return switchVideoModeByAgent('IR', '红外模式');
        }

        if (/rgb|可见光/.test(text)) {
            return switchVideoModeByAgent('RGB', 'RGB模式');
        }

        if (/增强|图像增强/.test(text)) {
            return switchVideoModeByAgent('Enhance', '图像增强模式');
        }

        if (/退出分屏|关闭分屏/.test(text)) {
            return toggleSplitModeByAgent(false);
        }

        if (/开启分屏|打开分屏|分屏/.test(text)) {
            return toggleSplitModeByAgent(true);
        }

        if (/多模态|分析助手/.test(text)) {
            return openMultimodalAssistantByAgent();
        }

        if (/自动检测|检测路况|分析路况|检测画面/.test(text)) {
            return runMultimodalDetectByAgent();
        }

        if (/开启.*semi|打开.*semi|启用.*semi/.test(text)) {
            localStorage.setItem('omni_semi_enabled', 'true');
            return '已开启 OmniAero-Semi 模型。';
        }

        if (/关闭.*semi|禁用.*semi/.test(text)) {
            localStorage.setItem('omni_semi_enabled', 'false');
            return '已关闭 OmniAero-Semi 模型。';
        }

        const droneNo = parseDroneNo(text);

        if (droneNo && /连接|断开/.test(text)) {
            return runDroneCommandByAgent(droneNo, 'connect');
        }

        if (droneNo && /返航/.test(text)) {
            return runDroneCommandByAgent(droneNo, 'rth');
        }

        if (droneNo && /巡检/.test(text)) {
            return runDroneCommandByAgent(droneNo, 'inspect');
        }

        if (droneNo && /侦察|侦查/.test(text)) {
            return runDroneCommandByAgent(droneNo, 'recon');
        }

        return '我还不理解这个指令。你可以输入“帮助”查看我当前能执行的功能。';
    }

    function isUserPage() {
        return location.pathname.endsWith('/user.html') || location.pathname.endsWith('/');
    }

    function requireUserPage() {
        if (!isUserPage()) {
            location.href = 'user.html';
            return false;
        }
        return true;
    }

    function parseDroneNo(text) {
        const match = text.match(/(?:无人机)?\s*0?([1-5])\s*号?/);
        if (match) return Number(match[1]);

        const cnMap = {
            '一': 1,
            '二': 2,
            '三': 3,
            '四': 4,
            '五': 5
        };

        for (const key in cnMap) {
            if (text.includes(`${key}号`) || text.includes(`无人机${key}`)) {
                return cnMap[key];
            }
        }

        return null;
    }

    function runDroneCommandByAgent(no, action) {
        if (!requireUserPage()) {
            return '我已打开无人机页面，请再发送一次这条无人机指令。';
        }

        const id = `drone_0${no}`;
        const item = document.querySelector(`.drone-item[data-id="${id}"]`);

        if (!item) {
            return `没有找到无人机 ${no} 号。`;
        }

        if (typeof executeDroneCommand !== 'function') {
            return '当前页面的无人机控制函数还没有加载完成，请稍后再试。';
        }

        executeDroneCommand(item, action, null);

        const actionText = {
            connect: '连接/断开',
            rth: '返航',
            inspect: '巡检',
            recon: '侦察'
        };

        return `已尝试对无人机 ${no} 号执行：${actionText[action]}。`;
    }

    function switchVideoModeByAgent(mode, label) {
        if (!requireUserPage()) {
            return '我已打开无人机页面，请再发送一次切换画面模式指令。';
        }

        if (typeof switchVideoMode === 'function') {
            switchVideoMode(mode);
        }

        const modeBtn = document.getElementById('modeBtn');
        if (modeBtn) modeBtn.innerHTML = `${label} ▼`;

        return `已切换到${label}。`;
    }

    function toggleSplitModeByAgent(enable) {
        if (!requireUserPage()) {
            return '我已打开无人机页面，请再发送一次分屏指令。';
        }

        const btn = document.getElementById('multiModeBtn');
        if (!btn) return '没有找到分屏按钮。';

        const isOpen = btn.classList.contains('active');

        if (enable && !isOpen) btn.click();
        if (!enable && isOpen) btn.click();

        return enable ? '已开启分屏选择模式。' : '已退出分屏模式。';
    }

    function openMultimodalAssistantByAgent() {
        if (!requireUserPage()) {
            return '我已打开无人机页面，请再发送一次多模态助手指令。';
        }

        const panel = document.getElementById('mm-assistant-panel');
        const handle = document.getElementById('mm-assistant-handle');

        if (panel && handle && !panel.classList.contains('open')) {
            handle.click();
        }

        return '已打开多模态分析助手。';
    }

    function runMultimodalDetectByAgent() {
        if (!requireUserPage()) {
            return '我已打开无人机页面，请再发送一次自动检测指令。';
        }


        if (typeof requestMultimodalAnalysis !== 'function') {
            return '当前多模态检测函数还没有加载完成。';
        }

        requestMultimodalAnalysis('agent_detect');
        return '已开始自动检测当前路况。';
    }

    document.addEventListener('DOMContentLoaded', ensureAgentHistoryToggle);
})();

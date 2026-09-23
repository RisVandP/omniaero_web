(function() {
    const AGENT_HISTORY_OPEN_CLASS = 'history-open';
    const STORAGE_KEYS = {
        scheduleList: 'omni_agent_schedules',
        activeWorkflow: 'omni_agent_active_workflow',
        workflowQueue: 'omni_agent_workflow_queue'
    };
    const SESSION_KEYS = {
        resumeToken: 'omni_agent_resume_token',
        resumeRequest: 'omni_agent_resume_request'
    };
    const SCHEDULE_CHECK_INTERVAL = 15000;
    const WORKFLOW_RETRY_DELAY = 600;
    const WORKFLOW_STEP_DELAY = 2000;
    const WORKFLOW_RESUME_TTL = 2 * 60 * 1000;

    let workflowRunnerTimer = null;
    let scheduleTimer = null;

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

    window.sendAgentMsg = async function() {
        ensureAgentHistoryToggle();

        const inputEl = document.getElementById('agent-input');
        const msg = inputEl ? inputEl.value.trim() : '';
        if (!msg) return;

        appendAgentMessage('user', msg);
        inputEl.value = '';

        const reply = await runAgentCommand(msg);

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

    async function runAgentCommand(rawText) {
        const text = String(rawText || '').trim();
        const normalized = normalizeText(text);

        if (/帮助|能做什么|指令/.test(normalized)) {
            return [
                '我现在可以执行这些指令：',
                '1. 打开地图 / 打开数据中心 / 打开模型设置 / 回到无人机页面',
                '2. 连接2号无人机 / 2号返航 / 2号巡检 / 2号侦察',
                '3. 切换RGB / 切换红外 / 开启图像增强 / 开启分屏 / 退出分屏',
                '4. 打开多模态助手 / 自动检测当前路况 / 开启Semi模型 / 关闭Semi模型',
                '5. 直接发送执行链，例如：连接2号无人机 -> 打开模型设置 -> 开启Semi模型 -> 回到无人机页面 -> 打开多模态助手 -> 自动检测当前路况',
                '6. 发送 Markdown 表格创建定时任务，表头支持：任务名 | 时间 | 重复 | 指令',
                '7. 查看定时任务 / 删除定时任务 任务ID / 清空定时任务'
            ].join('\n');
        }

        if (/查看定时任务|任务列表|已定时/.test(normalized)) {
            return formatSchedules();
        }

        if (/生成演示定时任务|模拟定时事件|演示任务|截图任务/.test(normalized)) {
            seedDemoSchedules();
            return '已生成一组演示用的定时事件，包含待执行、执行中、已完成三种状态，可直接截图。';
        }

        if (/清空定时任务|删除全部定时任务/.test(normalized)) {
            saveSchedules([]);
            renderSchedulePanel();
            return '已清空全部定时任务。';
        }

        const deleteMatch = normalized.match(/删除定时任务\s*([a-z0-9_-]+)/i);
        if (deleteMatch) {
            const deleted = deleteSchedule(deleteMatch[1]);
            renderSchedulePanel();
            return deleted ? `已删除定时任务 ${deleteMatch[1]}。` : `没有找到定时任务 ${deleteMatch[1]}。`;
        }

        const taskTable = parseScheduleTable(text);
        if (taskTable.length) {
            const created = createSchedulesFromRows(taskTable);
            renderSchedulePanel();
            if (!created.length) {
                return '表格已识别，但没有成功生成任务。请检查“时间 / 重复 / 指令”列。';
            }
            return [
                `已创建 ${created.length} 条定时任务：`,
                ...created.map((item) => `${item.id} | ${item.name} | ${item.timeText} | ${item.repeatText}`)
            ].join('\n');
        }

        const parsedChain = parseWorkflowChain(text);
        if (parsedChain.steps.length > 1 || /自动接管|执行链路|工作流/.test(normalized)) {
            if (!parsedChain.steps.length) {
                return '执行链路里有我暂时无法识别的步骤。请使用“连接2号无人机 -> 打开模型设置 -> 开启Semi模型”这种格式。';
            }
            enqueueWorkflow(parsedChain.steps, parsedChain.name || '手动执行链路');
            scheduleWorkflowRunner(50);
            return `已接管执行链路，共 ${parsedChain.steps.length} 步，后台会自动跨页面继续执行。`;
        }

        if (/地图|gis|天眼/.test(normalized)) {
            navigateToPage('map.html');
            return '正在打开天眼 GIS 页面。';
        }

        if (/数据中心|数据/.test(normalized)) {
            navigateToPage('datacenter.html');
            return '正在打开数据中心。';
        }

        if (/模型设置|模型页面|模型仓库/.test(normalized)) {
            navigateToPage('settings.html');
            return '正在打开模型设置页面。';
        }

        if (/无人机页面|监控页面|回到无人机/.test(normalized)) {
            navigateToPage('user.html');
            return '正在回到无人机监控页面。';
        }

        if (/红外|ir/.test(normalized)) {
            return switchVideoModeByAgent('IR', '红外模式');
        }

        if (/rgb|可见光/.test(normalized)) {
            return switchVideoModeByAgent('RGB', 'RGB模式');
        }

        if (/增强|图像增强/.test(normalized)) {
            return switchVideoModeByAgent('Enhance', '图像增强模式');
        }

        if (/退出分屏|关闭分屏/.test(normalized)) {
            return toggleSplitModeByAgent(false);
        }

        if (/开启分屏|打开分屏|分屏/.test(normalized)) {
            return toggleSplitModeByAgent(true);
        }

        if (/多模态|分析助手/.test(normalized)) {
            return openMultimodalAssistantByAgent();
        }

        if (/自动检测|检测路况|分析路况|检测画面/.test(normalized)) {
            return runMultimodalDetectByAgent();
        }

        if (/开启.*semi|打开.*semi|启用.*semi/.test(normalized)) {
            return setSemiModelEnabled(true);
        }

        if (/关闭.*semi|禁用.*semi/.test(normalized)) {
            return setSemiModelEnabled(false);
        }

        const droneNo = parseDroneNo(normalized);

        if (droneNo && /连接|断开/.test(normalized)) {
            return runDroneCommandByAgent(droneNo, 'connect');
        }

        if (droneNo && /返航/.test(normalized)) {
            return runDroneCommandByAgent(droneNo, 'rth');
        }

        if (droneNo && /巡检/.test(normalized)) {
            return runDroneCommandByAgent(droneNo, 'inspect');
        }

        if (droneNo && /侦察|侦查/.test(normalized)) {
            return runDroneCommandByAgent(droneNo, 'recon');
        }

        return '我还不理解这个指令。你可以输入“帮助”查看我当前能执行的功能。';
    }

    function initAgentAutomation() {
        ensureAgentHistoryToggle();
        bindSchedulePanel();
        bindManualAgentInterruption();
        cleanupAutoDemoState();
        cleanupOrphanWorkflowState(consumeResumeRequest());
        renderSchedulePanel();
        scheduleWorkflowRunner(300);
        runScheduleCheck();
        clearInterval(scheduleTimer);
        scheduleTimer = setInterval(runScheduleCheck, SCHEDULE_CHECK_INTERVAL);

        window.addEventListener('storage', (event) => {
            if ([STORAGE_KEYS.activeWorkflow, STORAGE_KEYS.workflowQueue, STORAGE_KEYS.scheduleList].includes(event.key)) {
                renderSchedulePanel();
                scheduleWorkflowRunner(80);
            }
        });

        window.addEventListener('focus', () => scheduleWorkflowRunner(80));
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) scheduleWorkflowRunner(80);
        });
        window.addEventListener('message', (event) => {
            if (event.origin !== window.location.origin || event.data?.type !== 'omni-agent:resume') return;
            scheduleWorkflowRunner(80);
        });
    }

    function bindManualAgentInterruption() {
        document.addEventListener('click', (event) => {
            if (!event.isTrusted) return;

            const navTarget = event.target.closest('.nav-tab, .menu-item');
            if (!navTarget) return;

            cancelActiveAutomation('已检测到手动页面切换，当前 Agent 链路已停止。');
        }, true);

        document.addEventListener('change', (event) => {
            if (!event.isTrusted) return;

            const target = event.target;
            if (!target) return;

            if (window.__omniAgentChangingSemi) return;

            if (target.id === 'omniAeroSemiToggle') {
                cancelActiveAutomation('已检测到你手动切换 Semi 模型，当前 Agent 链路已停止。');
            }
        }, true);
    }

    function cleanupAutoDemoState() {
        const schedules = getSchedules();
        const activeWorkflow = getActiveWorkflow();
        const queuedWorkflow = getWorkflowQueue();

        const onlyDemoSchedules = schedules.length > 0 && schedules.every((item) => String(item.id || '').startsWith('task_demo_'));
        const demoActiveWorkflow = !!(activeWorkflow && String(activeWorkflow.id || '').startsWith('wf_demo_'));
        const hasQueued = Array.isArray(queuedWorkflow) && queuedWorkflow.length > 0;
        const demoQueuedWorkflows = hasQueued && queuedWorkflow.every((item) => String((item && item.id) || '').startsWith('wf_demo_'));

        if (onlyDemoSchedules) {
            saveSchedules([]);
        }

        if (demoActiveWorkflow) {
            saveActiveWorkflow(null);
        }

        if (demoQueuedWorkflows) {
            saveWorkflowQueue([]);
        }
    }

    function cleanupOrphanWorkflowState(hasResumeRequest) {
        const activeWorkflow = getActiveWorkflow();
        const queuedWorkflow = getWorkflowQueue();
        const hasWorkflow = !!activeWorkflow || (Array.isArray(queuedWorkflow) && queuedWorkflow.length > 0);

        if (!hasWorkflow) {
            clearResumeToken();
            return;
        }

        const now = Date.now();
        const resumeToken = getResumeToken();
        const resumeAge = resumeToken ? now - Number(resumeToken) : Number.POSITIVE_INFINITY;
        const workflowAge = getWorkflowAge(activeWorkflow, queuedWorkflow, now);

        if (!hasResumeRequest && workflowAge <= WORKFLOW_RESUME_TTL) {
            touchResumeToken();
            return;
        }

        if (resumeAge > WORKFLOW_RESUME_TTL || workflowAge > WORKFLOW_RESUME_TTL) {
            saveActiveWorkflow(null);
            saveWorkflowQueue([]);
            clearResumeToken();
        }
    }

    function getWorkflowAge(activeWorkflow, queuedWorkflow, now) {
        const createdAtList = [];

        if (activeWorkflow && activeWorkflow.createdAt) {
            createdAtList.push(activeWorkflow.createdAt);
        }

        if (Array.isArray(queuedWorkflow)) {
            queuedWorkflow.forEach((item) => {
                if (item && item.createdAt) {
                    createdAtList.push(item.createdAt);
                }
            });
        }

        if (!createdAtList.length) {
            return Number.POSITIVE_INFINITY;
        }

        const timestamps = createdAtList
            .map((value) => new Date(value).getTime())
            .filter((value) => Number.isFinite(value));

        if (!timestamps.length) {
            return Number.POSITIVE_INFINITY;
        }

        return now - Math.min(...timestamps);
    }

    function scheduleWorkflowRunner(delay) {
        const waitMs = typeof delay === 'number' ? delay : WORKFLOW_RETRY_DELAY;
        if (workflowRunnerTimer) {
            clearTimeout(workflowRunnerTimer);
        }
        workflowRunnerTimer = setTimeout(() => {
            workflowRunnerTimer = null;
            runWorkflowTick();
        }, waitMs);
    }

    function bindSchedulePanel() {
        const toggleBtn = document.getElementById('agent-schedule-btn');
        const closeBtn = document.getElementById('agent-schedule-close');
        const panel = document.getElementById('agent-schedule-panel');
        const list = document.getElementById('agent-schedule-list');

        if (!panel || !list) return;

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                panel.classList.toggle('open');
                renderSchedulePanel();
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                panel.classList.remove('open');
            });
        }

        list.addEventListener('click', (event) => {
            const deleteBtn = event.target.closest('[data-schedule-delete]');
            if (!deleteBtn) return;

            const scheduleId = deleteBtn.getAttribute('data-schedule-delete');
            if (!scheduleId) return;

            deleteSchedule(scheduleId);
            renderSchedulePanel();
            appendAgentMessage('system', `已删除定时任务 ${scheduleId}。`);
        });
    }

    function renderSchedulePanel() {
        const list = document.getElementById('agent-schedule-list');
        if (!list) return;

        const schedules = getSchedules();
        const activeWorkflow = getActiveWorkflow();
        const queuedWorkflow = getWorkflowQueue();
        if (!schedules.length) {
            list.innerHTML = '<div class="agent-schedule-empty">当前没有定时任务。<br>可以直接发送 Markdown 表格创建。</div>';
            return;
        }

        list.innerHTML = `
            <table class="agent-schedule-table">
                <thead>
                    <tr>
                        <th>任务名</th>
                        <th>状态</th>
                        <th>时间</th>
                        <th>重复</th>
                        <th>指令</th>
                        <th>上次执行</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${schedules.map((item) => {
                        const status = getScheduleDisplayStatus(item, activeWorkflow, queuedWorkflow);
                        const lastRun = item.lastRunAt ? formatLocalDateTime(item.lastRunAt) : '未执行';
                        return `
                            <tr>
                                <td class="agent-schedule-col-name">${escapeHtml(item.name || '未命名任务')}</td>
                                <td><span class="agent-schedule-status ${status.className}">${escapeHtml(status.label)}</span></td>
                                <td>${escapeHtml(item.timeText || '-')}</td>
                                <td>${escapeHtml(item.repeatText || '-')}</td>
                                <td class="agent-schedule-col-command" title="${escapeHtml(item.commandText || '')}">${escapeHtml(item.commandText || '')}</td>
                                <td>${escapeHtml(lastRun)}</td>
                                <td>
                                    <button class="agent-schedule-delete" type="button" data-schedule-delete="${escapeHtml(item.id || '')}">删除</button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    function getScheduleDisplayStatus(item, activeWorkflow, queuedWorkflow) {
        const scheduleId = item && item.id ? item.id : '';
        const isRunning = !!(activeWorkflow && activeWorkflow.source && activeWorkflow.source.scheduleId === scheduleId);
        const isQueued = Array.isArray(queuedWorkflow) && queuedWorkflow.some((workflow) => workflow && workflow.source && workflow.source.scheduleId === scheduleId);

        if (isRunning) {
            return { label: '执行中', className: 'is-running' };
        }
        if (isQueued) {
            return { label: '排队中', className: 'is-queued' };
        }
        if (item.executedAt || item.lastRunAt) {
            return { label: '已完成', className: 'is-done' };
        }
        return { label: '待执行', className: 'is-pending' };
    }

    function seedDemoSchedules() {
        const now = new Date();
        const demoSchedules = [
            {
                id: 'task_demo_morning',
                name: '早高峰巡检',
                timeText: shiftMinutes(now, -35),
                repeatText: '每天',
                repeatType: 'daily',
                repeatValue: '',
                commandText: '连接2号无人机 -> 回到无人机页面 -> 打开多模态助手 -> 自动检测当前路况',
                createdAt: now.toISOString(),
                lastRunAt: new Date(now.getTime() - 25 * 60 * 1000).toISOString(),
                executedAt: ''
            },
            {
                id: 'task_demo_semi',
                name: '模型联动检测',
                timeText: shiftMinutes(now, -5),
                repeatText: '工作日',
                repeatType: 'weekdays',
                repeatValue: '',
                commandText: '连接2号无人机 -> 打开模型设置 -> 开启Semi模型 -> 回到无人机页面 -> 自动检测当前路况',
                createdAt: now.toISOString(),
                lastRunAt: '',
                executedAt: ''
            },
            {
                id: 'task_demo_evening',
                name: '晚间复检',
                timeText: shiftMinutes(now, 25),
                repeatText: '每天',
                repeatType: 'daily',
                repeatValue: '',
                commandText: '回到无人机页面 -> 打开多模态助手 -> 自动检测当前路况',
                createdAt: now.toISOString(),
                lastRunAt: '',
                executedAt: ''
            }
        ];

        saveSchedules(demoSchedules);

        const runningWorkflow = {
            id: 'wf_demo_running',
            name: '模型联动检测',
            steps: parseWorkflowChain(demoSchedules[1].commandText).steps,
            source: { scheduleId: 'task_demo_semi' },
            currentStepIndex: 2,
            createdAt: now.toISOString(),
            logs: [
                { step: '连接2号无人机', at: new Date(now.getTime() - 90 * 1000).toISOString() },
                { step: '打开模型设置', at: new Date(now.getTime() - 45 * 1000).toISOString() }
            ]
        };

        const queuedWorkflow = [{
            id: 'wf_demo_queue',
            name: '晚间复检',
            steps: parseWorkflowChain(demoSchedules[2].commandText).steps,
            source: { scheduleId: 'task_demo_evening' },
            currentStepIndex: 0,
            createdAt: now.toISOString(),
            logs: []
        }];

        saveActiveWorkflow(runningWorkflow);
        saveWorkflowQueue(queuedWorkflow);
        renderSchedulePanel();
    }

    function runScheduleCheck() {
        const now = new Date();
        const schedules = getSchedules();
        let changed = false;

        schedules.forEach((item) => {
            if (!isScheduleDue(item, now)) return;

            const parsed = parseWorkflowChain(item.commandText || '');
            if (!parsed.steps.length) return;

            enqueueWorkflow(parsed.steps, item.name || '定时任务', {
                scheduleId: item.id
            });
            item.lastRunAt = now.toISOString();
            if (item.repeatType === 'once') {
                item.executedAt = now.toISOString();
            }
            changed = true;
        });

        if (changed) {
            saveSchedules(schedules);
            scheduleWorkflowRunner(80);
        }
    }

    function isScheduleDue(item, now) {
        if (!item || !item.timeText) return false;

        if (item.repeatType === 'once' && item.executedAt) {
            return false;
        }

        if (item.repeatType === 'once') {
            const onceAt = parseOnceDateTime(item.timeText);
            return !!onceAt && now >= onceAt;
        }

        const todayKey = formatDateKey(now);
        const currentTime = formatTimeKey(now);

        if (item.lastRunAt && formatDateKey(new Date(item.lastRunAt)) === todayKey) {
            return false;
        }

        if (currentTime !== item.timeText) {
            return false;
        }

        if (item.repeatType === 'daily') return true;
        if (item.repeatType === 'weekdays') return now.getDay() >= 1 && now.getDay() <= 5;
        if (item.repeatType === 'weekly') return now.getDay() === Number(item.repeatValue || 0);
        return false;
    }

    function runWorkflowTick() {
        let workflow = getActiveWorkflow();

        if (!workflow) {
            workflow = shiftWorkflowFromQueue();
            if (!workflow) return;
            saveActiveWorkflow(workflow);
        }

        touchResumeToken();

        if (workflow.completedAt || workflow.failedAt) return;

        const step = workflow.steps[workflow.currentStepIndex || 0];
        if (!step) {
            completeWorkflow(workflow);
            return;
        }

        const result = executeWorkflowStep(step);

        if (result === 'navigating' || result === 'waiting') {
            scheduleWorkflowRunner(result === 'navigating' ? 1200 : WORKFLOW_RETRY_DELAY);
            return;
        }

        if (result && result.ok) {
            workflow.currentStepIndex += 1;
            workflow.logs = workflow.logs || [];
            workflow.logs.push({
                step: step.label,
                at: new Date().toISOString()
            });
            saveActiveWorkflow(workflow);

            if (workflow.currentStepIndex >= workflow.steps.length) {
                completeWorkflow(workflow);
                return;
            }

            scheduleWorkflowRunner(WORKFLOW_STEP_DELAY);
            return;
        }

        workflow.failedAt = new Date().toISOString();
        workflow.error = result && result.error ? result.error : 'unknown_workflow_error';
        saveActiveWorkflow(workflow);
    }

    function completeWorkflow(workflow) {
        workflow.completedAt = new Date().toISOString();
        saveActiveWorkflow(null);

        if (workflow.source && workflow.source.scheduleId) {
            markScheduleExecuted(workflow.source.scheduleId, workflow.completedAt);
        }

        const queued = shiftWorkflowFromQueue();
        if (queued) {
            saveActiveWorkflow(queued);
            scheduleWorkflowRunner(120);
            return;
        }

        clearResumeToken();
    }

    function cancelActiveAutomation(message) {
        const activeWorkflow = getActiveWorkflow();
        const queuedWorkflow = getWorkflowQueue();
        const hasWorkflow = !!activeWorkflow || (Array.isArray(queuedWorkflow) && queuedWorkflow.length > 0);

        if (!hasWorkflow) return;

        saveActiveWorkflow(null);
        saveWorkflowQueue([]);
        clearResumeToken();

        if (message) {
            appendAgentMessage('system', message);
        }
    }

    function executeWorkflowStep(step) {
        switch (step.type) {
            case 'open_page':
                if (isPage(step.page)) {
                    return { ok: true };
                }
                navigateToPage(step.target);
                return 'navigating';
            case 'connect_drone':
                if (!isUserPage()) {
                    navigateToPage('user.html');
                    return 'navigating';
                }
                return ensureDroneConnection(step.droneNo, true);
            case 'disconnect_drone':
                if (!isUserPage()) {
                    navigateToPage('user.html');
                    return 'navigating';
                }
                return ensureDroneConnection(step.droneNo, false);
            case 'drone_action':
                if (!isUserPage()) {
                    navigateToPage('user.html');
                    return 'navigating';
                }
                return runDroneAction(step.droneNo, step.action);
            case 'switch_mode':
                return switchVideoModeByAgent(step.mode, step.label, true);
            case 'split_mode':
                return toggleSplitModeByAgent(step.enable, true);
            case 'open_multimodal':
                return openMultimodalAssistantByAgent(true);
            case 'run_multimodal':
                return runMultimodalDetectByAgent(true);
            case 'set_semi':
                if (!isModelPage()) {
                    navigateToPage('settings.html');
                    return 'navigating';
                }
                return ensureSemiToggle(step.enable);
            default:
                return { error: `unsupported_step:${step.type}` };
        }
    }

    function parseWorkflowChain(rawText) {
        const text = String(rawText || '').trim();
        if (!text) return { name: '', steps: [] };

        const compact = text
            .replace(/\r/g, '')
            .replace(/---->/g, '->')
            .replace(/—>/g, '->')
            .replace(/→/g, '->')
            .replace(/=>/g, '->');

        const parts = compact
            .split(/\s*->\s*|\n+/)
            .map((item) => item.trim())
            .filter(Boolean);

        const steps = [];
        for (const part of parts) {
            const step = parseWorkflowStep(part);
            if (!step) continue;
            steps.push(step);
        }

        return { name: parts[0] || '执行链路', steps };
    }

    function parseWorkflowStep(text) {
        const normalized = normalizeText(text);
        const droneNo = parseDroneNo(normalized);

        if (/打开地图|进入地图|gis|天眼/.test(normalized)) {
            return { type: 'open_page', page: 'map', target: 'map.html', label: '打开地图' };
        }
        if (/打开数据中心|进入数据中心/.test(normalized)) {
            return { type: 'open_page', page: 'datacenter', target: 'datacenter.html', label: '打开数据中心' };
        }
        if (/打开模型|模型设置|模型仓库/.test(normalized)) {
            return { type: 'open_page', page: 'settings', target: 'settings.html', label: '打开模型设置' };
        }
        if (/回到无人机|打开无人机|无人机页面|监控页面/.test(normalized)) {
            return { type: 'open_page', page: 'user', target: 'user.html', label: '回到无人机页面' };
        }
        if (droneNo && /连接/.test(normalized)) {
            return { type: 'connect_drone', droneNo: droneNo, label: `连接${droneNo}号无人机` };
        }
        if (droneNo && /断开/.test(normalized)) {
            return { type: 'disconnect_drone', droneNo: droneNo, label: `断开${droneNo}号无人机` };
        }
        if (droneNo && /返航/.test(normalized)) {
            return { type: 'drone_action', droneNo: droneNo, action: 'rth', label: `${droneNo}号返航` };
        }
        if (droneNo && /巡检/.test(normalized)) {
            return { type: 'drone_action', droneNo: droneNo, action: 'inspect', label: `${droneNo}号巡检` };
        }
        if (droneNo && /侦察|侦查/.test(normalized)) {
            return { type: 'drone_action', droneNo: droneNo, action: 'recon', label: `${droneNo}号侦察` };
        }
        if (/打开多模态|多模态助手|分析助手/.test(normalized)) {
            return { type: 'open_multimodal', label: '打开多模态助手' };
        }
        if (/自动检测|检测路况|分析路况|检测画面/.test(normalized)) {
            return { type: 'run_multimodal', label: '执行自动检测' };
        }
        if (/开启.*semi|打开.*semi|启用.*semi|omniaerosemi/.test(normalized)) {
            return { type: 'set_semi', enable: true, label: '开启 OmniAero-Semi' };
        }
        if (/关闭.*semi|禁用.*semi/.test(normalized)) {
            return { type: 'set_semi', enable: false, label: '关闭 OmniAero-Semi' };
        }
        if (/红外|ir/.test(normalized)) {
            return { type: 'switch_mode', mode: 'IR', label: '切换红外模式' };
        }
        if (/rgb|可见光/.test(normalized)) {
            return { type: 'switch_mode', mode: 'RGB', label: '切换 RGB 模式' };
        }
        if (/增强|图像增强/.test(normalized)) {
            return { type: 'switch_mode', mode: 'Enhance', label: '切换图像增强模式' };
        }
        if (/开启分屏|打开分屏/.test(normalized)) {
            return { type: 'split_mode', enable: true, label: '开启分屏' };
        }
        if (/退出分屏|关闭分屏/.test(normalized)) {
            return { type: 'split_mode', enable: false, label: '退出分屏' };
        }

        return null;
    }

    function parseScheduleTable(text) {
        const lines = String(text || '')
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);

        const pipeLines = lines.filter((line) => line.includes('|'));
        if (pipeLines.length < 2) return [];

        const rows = pipeLines.map((line) =>
            line
                .split('|')
                .map((cell) => cell.trim())
                .filter((cell, index, arr) => !(index === 0 && cell === '') && !(index === arr.length - 1 && cell === ''))
        );

        const header = rows[0].map((cell) => normalizeText(cell));
        const headerIndex = {
            name: findHeaderIndex(header, ['任务名', '名称', 'name']),
            time: findHeaderIndex(header, ['时间', '执行时间', 'time']),
            repeat: findHeaderIndex(header, ['重复', '周期', 'repeat']),
            command: findHeaderIndex(header, ['指令', '命令', '任务', '执行链路', 'workflow'])
        };

        if (headerIndex.time === -1 || headerIndex.command === -1) return [];

        return rows
            .slice(1)
            .filter((cells) => !cells.every((cell) => /^:?-{3,}:?$/.test(cell)))
            .map((cells, index) => ({
                name: headerIndex.name >= 0 ? cells[headerIndex.name] || `任务${index + 1}` : `任务${index + 1}`,
                timeText: headerIndex.time >= 0 ? normalizeScheduleTime(cells[headerIndex.time] || '') : '',
                repeatText: headerIndex.repeat >= 0 ? cells[headerIndex.repeat] || '每天' : '每天',
                commandText: headerIndex.command >= 0 ? cells[headerIndex.command] || '' : ''
            }))
            .filter((row) => row.timeText && row.commandText);
    }

    function createSchedulesFromRows(rows) {
        const schedules = getSchedules();
        const created = [];

        rows.forEach((row, index) => {
            const repeatMeta = parseRepeatText(row.repeatText);
            if (!repeatMeta) return;

            const item = {
                id: `task_${Date.now().toString(36)}_${index + 1}`,
                name: row.name || `任务${index + 1}`,
                timeText: row.timeText,
                repeatText: row.repeatText || '每天',
                repeatType: repeatMeta.type,
                repeatValue: repeatMeta.value || '',
                commandText: row.commandText,
                createdAt: new Date().toISOString(),
                lastRunAt: ''
            };
            schedules.push(item);
            created.push(item);
        });

        saveSchedules(schedules);
        return created;
    }

    function formatSchedules() {
        const schedules = getSchedules();
        if (!schedules.length) {
            return '当前没有定时任务。';
        }

        return [
            '当前定时任务：',
            ...schedules.map((item) => {
                const lastRun = item.lastRunAt ? `，上次执行 ${formatLocalDateTime(item.lastRunAt)}` : '';
                return `${item.id} | ${item.name} | ${item.timeText} | ${item.repeatText}${lastRun}`;
            })
        ].join('\n');
    }

    function deleteSchedule(id) {
        const schedules = getSchedules();
        const nextSchedules = schedules.filter((item) => item.id !== id);
        if (nextSchedules.length === schedules.length) return false;
        saveSchedules(nextSchedules);
        return true;
    }

    function markScheduleExecuted(scheduleId, at) {
        const schedules = getSchedules();
        const target = schedules.find((item) => item.id === scheduleId);
        if (!target) return;
        target.lastRunAt = at;
        if (target.repeatType === 'once') {
            target.executedAt = at;
        }
        saveSchedules(schedules);
    }

    function getSchedules() {
        return readJson(STORAGE_KEYS.scheduleList, []);
    }

    function saveSchedules(list) {
        localStorage.setItem(STORAGE_KEYS.scheduleList, JSON.stringify(list || []));
        renderSchedulePanel();
    }

    function enqueueWorkflow(steps, name, source) {
        if (!Array.isArray(steps) || !steps.length) return;

        const workflow = {
            id: `wf_${Date.now().toString(36)}`,
            name: name || '执行链路',
            steps: steps,
            source: source || null,
            currentStepIndex: 0,
            createdAt: new Date().toISOString(),
            logs: []
        };

        if (!getActiveWorkflow()) {
            saveActiveWorkflow(workflow);
            return;
        }

        const queue = getWorkflowQueue();
        queue.push(workflow);
        saveWorkflowQueue(queue);
    }

    function getActiveWorkflow() {
        return readJson(STORAGE_KEYS.activeWorkflow, null);
    }

    function saveActiveWorkflow(workflow) {
        if (!workflow) {
            localStorage.removeItem(STORAGE_KEYS.activeWorkflow);
            if (!getWorkflowQueue().length) {
                clearResumeToken();
            }
            return;
        }
        localStorage.setItem(STORAGE_KEYS.activeWorkflow, JSON.stringify(workflow));
        touchResumeToken();
    }

    function getWorkflowQueue() {
        return readJson(STORAGE_KEYS.workflowQueue, []);
    }

    function saveWorkflowQueue(queue) {
        localStorage.setItem(STORAGE_KEYS.workflowQueue, JSON.stringify(queue || []));
        if (queue && queue.length) {
            touchResumeToken();
        } else if (!getActiveWorkflow()) {
            clearResumeToken();
        }
    }

    function shiftWorkflowFromQueue() {
        const queue = getWorkflowQueue();
        if (!queue.length) return null;
        const workflow = queue.shift();
        saveWorkflowQueue(queue);
        touchResumeToken();
        return workflow;
    }

    function setSemiModelEnabled(enable) {
        if (!isModelPage()) {
            enqueueWorkflow([
                { type: 'open_page', page: 'settings', target: 'settings.html', label: '打开模型设置' },
                { type: 'set_semi', enable: enable, label: enable ? '开启 OmniAero-Semi' : '关闭 OmniAero-Semi' }
            ], enable ? '开启 Semi 模型' : '关闭 Semi 模型');
            scheduleWorkflowRunner(50);
            return enable ? '已接管流程，正在前往模型页面开启 OmniAero-Semi。' : '已接管流程，正在前往模型页面关闭 OmniAero-Semi。';
        }

        const result = ensureSemiToggle(enable);
        return result.ok
            ? (enable ? '已开启 OmniAero-Semi 模型。' : '已关闭 OmniAero-Semi 模型。')
            : '当前模型开关还没有加载完成，请稍后再试。';
    }

    function ensureSemiToggle(enable) {
        const value = enable ? 'true' : 'false';
        localStorage.setItem('omni_semi_enabled', value);

        if (typeof window.setOmniAeroSemiEnabled === 'function') {
            window.__omniAgentChangingSemi = true;
            try {
                window.setOmniAeroSemiEnabled(enable);
            } finally {
                window.__omniAgentChangingSemi = false;
            }
            return { ok: true };
        }

        const toggle = document.getElementById('omniAeroSemiToggle');
        if (!toggle) {
            window.dispatchEvent(new StorageEvent('storage', {
                key: 'omni_semi_enabled',
                newValue: value,
                oldValue: enable ? 'false' : 'true',
                storageArea: localStorage
            }));
            return { ok: true };
        }

        if (toggle.checked !== enable) {
            window.__omniAgentChangingSemi = true;
            try {
                toggle.checked = enable;
                toggle.dispatchEvent(new Event('input', { bubbles: true }));
                toggle.dispatchEvent(new Event('change', { bubbles: true }));
            } finally {
                window.__omniAgentChangingSemi = false;
            }
        }

        return { ok: true };
    }

    function runDroneCommandByAgent(no, action) {
        if (!requireUserPage()) {
            return '我已打开无人机页面，请再发送一次这条无人机指令。';
        }

        const result = action === 'connect'
            ? ensureDroneConnection(no, true)
            : runDroneAction(no, action);

        if (result === 'waiting') {
            return '当前页面的无人机控制函数还没有加载完成，请稍后再试。';
        }
        if (!result || result.error) {
            return result && result.error ? result.error : '无人机指令执行失败。';
        }

        const actionText = {
            connect: '连接',
            rth: '返航',
            inspect: '巡检',
            recon: '侦察'
        };

        return `已对无人机 ${no} 号执行：${actionText[action] || action}。`;
    }

    function ensureDroneConnection(no, connect) {
        const item = getDroneItem(no);
        if (!item) return { error: `没有找到无人机 ${no} 号。` };
        if (typeof executeDroneCommand !== 'function') return 'waiting';

        const statusDot = item.querySelector('.status-dot');
        const isOffline = statusDot ? statusDot.classList.contains('offline') : true;
        if (connect && isOffline) {
            executeDroneCommand(item, 'connect', null);
        }
        if (!connect && !isOffline) {
            executeDroneCommand(item, 'connect', null);
        }
        return { ok: true };
    }

    function runDroneAction(no, action) {
        const item = getDroneItem(no);
        if (!item) return { error: `没有找到无人机 ${no} 号。` };
        if (typeof executeDroneCommand !== 'function') return 'waiting';
        const statusDot = item.querySelector('.status-dot');
        if (statusDot && statusDot.classList.contains('offline')) {
            executeDroneCommand(item, 'connect', null);
        }
        executeDroneCommand(item, action, null);
        return { ok: true };
    }

    function getDroneItem(no) {
        const id = `drone_0${no}`;
        return document.querySelector(`.drone-item[data-id="${id}"]`);
    }

    function switchVideoModeByAgent(mode, label, silent) {
        if (!requireUserPage()) {
            return silent ? 'navigating' : '我已打开无人机页面，请再发送一次切换画面模式指令。';
        }

        if (typeof switchVideoMode !== 'function') {
            return silent ? 'waiting' : '当前画面模式函数还没有加载完成。';
        }

        switchVideoMode(mode);

        const modeBtn = document.getElementById('modeBtn');
        if (modeBtn) modeBtn.innerHTML = `${label} ▼`;

        return silent ? { ok: true } : `已切换到${label}。`;
    }

    function toggleSplitModeByAgent(enable, silent) {
        if (!requireUserPage()) {
            return silent ? 'navigating' : '我已打开无人机页面，请再发送一次分屏指令。';
        }

        const btn = document.getElementById('multiModeBtn');
        if (!btn) return silent ? 'waiting' : '没有找到分屏按钮。';

        const isOpen = btn.classList.contains('active');
        if (enable && !isOpen) btn.click();
        if (!enable && isOpen) btn.click();

        return silent ? { ok: true } : (enable ? '已开启分屏选择模式。' : '已退出分屏模式。');
    }

    function openMultimodalAssistantByAgent(silent) {
        if (!requireUserPage()) {
            return silent ? 'navigating' : '我已打开无人机页面，请再发送一次多模态助手指令。';
        }

        const panel = document.getElementById('mm-assistant-panel');
        const handle = document.getElementById('mm-assistant-handle');
        if (!panel || !handle) {
            return silent ? 'waiting' : '当前多模态助手还没有加载完成。';
        }

        if (!panel.classList.contains('open')) {
            handle.click();
        }

        return silent ? { ok: true } : '已打开多模态分析助手。';
    }

    function runMultimodalDetectByAgent(silent) {
        if (!requireUserPage()) {
            return silent ? 'navigating' : '我已打开无人机页面，请再发送一次自动检测指令。';
        }
        if (typeof requestMultimodalAnalysis !== 'function') {
            return silent ? 'waiting' : '当前多模态检测函数还没有加载完成。';
        }

        requestMultimodalAnalysis('agent_detect');
        return silent ? { ok: true } : '已开始自动检测当前路况。';
    }

    function isUserPage() {
        return /\/user\.html$/.test(location.pathname) || location.pathname === '/';
    }

    function isModelPage() {
        return /\/settings\.html$/.test(location.pathname);
    }

    function isPage(page) {
        if (page === 'user') return isUserPage();
        if (page === 'model') return isModelPage();
        if (page === 'settings') return isModelPage();
        if (page === 'map') return /\/map\.html$/.test(location.pathname);
        if (page === 'datacenter') return /\/datacenter\.html$/.test(location.pathname);
        return false;
    }

    function requireUserPage() {
        if (!isUserPage()) {
            navigateToPage('user.html');
            return false;
        }
        return true;
    }

    function navigateToPage(target) {
        if (location.pathname.endsWith(`/${target}`)) return;
        touchResumeToken();
        setResumeRequest();
        if (window.top !== window && window.parent) {
            window.parent.postMessage({ type: 'omni-spa:navigate', href: target }, window.location.origin);
            window.setTimeout(() => {
                try {
                    window.parent.postMessage({ type: 'omni-agent:resume', href: target }, window.location.origin);
                } catch (error) {
                    // Ignore cross-frame resume notification failures.
                }
            }, 180);
            return;
        }
        location.href = target;
    }

    function touchResumeToken() {
        try {
            sessionStorage.setItem(SESSION_KEYS.resumeToken, String(Date.now()));
        } catch (error) {
            // Ignore session storage failures.
        }
    }

    function getResumeToken() {
        try {
            return sessionStorage.getItem(SESSION_KEYS.resumeToken);
        } catch (error) {
            return null;
        }
    }

    function clearResumeToken() {
        try {
            sessionStorage.removeItem(SESSION_KEYS.resumeToken);
        } catch (error) {
            // Ignore session storage failures.
        }
    }

    function setResumeRequest() {
        try {
            sessionStorage.setItem(SESSION_KEYS.resumeRequest, '1');
        } catch (error) {
            // Ignore session storage failures.
        }
    }

    function consumeResumeRequest() {
        try {
            const exists = sessionStorage.getItem(SESSION_KEYS.resumeRequest) === '1';
            sessionStorage.removeItem(SESSION_KEYS.resumeRequest);
            return exists;
        } catch (error) {
            return false;
        }
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

    function parseRepeatText(text) {
        const normalized = normalizeText(text);
        if (!normalized || /每天|daily/.test(normalized)) {
            return { type: 'daily', value: '' };
        }
        if (/工作日|weekdays/.test(normalized)) {
            return { type: 'weekdays', value: '' };
        }
        if (/一次|单次|once/.test(normalized)) {
            return { type: 'once', value: '' };
        }

        const weekMap = {
            '周日': 0,
            '周天': 0,
            '星期日': 0,
            '星期天': 0,
            '周一': 1,
            '星期一': 1,
            '周二': 2,
            '星期二': 2,
            '周三': 3,
            '星期三': 3,
            '周四': 4,
            '星期四': 4,
            '周五': 5,
            '星期五': 5,
            '周六': 6,
            '星期六': 6
        };

        for (const key in weekMap) {
            if (normalized.includes(key)) {
                return { type: 'weekly', value: weekMap[key] };
            }
        }

        return null;
    }

    function parseOnceDateTime(text) {
        const normalized = String(text || '').trim().replace(/\//g, '-');
        if (!/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(normalized)) return null;
        const parsed = new Date(normalized.replace(' ', 'T'));
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function normalizeScheduleTime(text) {
        const value = String(text || '').trim().replace('：', ':');
        if (/^\d{1,2}:\d{2}$/.test(value)) {
            const parts = value.split(':');
            return `${parts[0].padStart(2, '0')}:${parts[1]}`;
        }
        if (/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}$/.test(value)) {
            const pair = value.split(/\s+/);
            const timeParts = pair[1].split(':');
            return `${pair[0]} ${timeParts[0].padStart(2, '0')}:${timeParts[1]}`;
        }
        return value;
    }

    function normalizeText(text) {
        return String(text || '')
            .trim()
            .toLowerCase()
            .replaceAll('（', '(')
            .replaceAll('）', ')')
            .replaceAll('：', ':');
    }

    function escapeHtml(text) {
        return String(text || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function findHeaderIndex(header, aliases) {
        return header.findIndex((item) => aliases.some((alias) => item.includes(alias)));
    }

    function readJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (err) {
            return fallback;
        }
    }

    function formatDateKey(date) {
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0')
        ].join('-');
    }

    function formatTimeKey(date) {
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }

    function shiftMinutes(date, minutes) {
        const target = new Date(date.getTime() + minutes * 60 * 1000);
        return formatTimeKey(target);
    }

    function formatLocalDateTime(isoText) {
        const date = new Date(isoText);
        if (Number.isNaN(date.getTime())) return isoText;
        return `${formatDateKey(date)} ${formatTimeKey(date)}`;
    }

    document.addEventListener('DOMContentLoaded', initAgentAutomation);
})();

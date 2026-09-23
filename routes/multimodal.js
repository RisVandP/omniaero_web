const express = require('express');
const router = express.Router();

const QWEN_API_KEY = process.env.AI_API_KEY_QWEN;
const QWEN_VL_MODEL = process.env.AI_QWEN_VL_MODEL || 'qwen-vl-max-latest';
const MULTIMODAL_TIMEOUT_MS = Number(process.env.MULTIMODAL_TIMEOUT_MS || 25000);

const VEHICLE_LABEL_MAP = {
    car: '小汽车',
    bus: '公交车',
    truck: '货车',
    motorcycle: '摩托车',
    other: '其他车辆'
};

const RISK_META_MAP = {
    high: { label: '高风险', color: 'red' },
    medium: { label: '一般风险', color: 'yellow' },
    low: { label: '低风险', color: 'green' }
};

router.post('/analyze', async (req, res) => {
    try {
        if (!QWEN_API_KEY) {
            return res.status(500).json({ error: 'qwen_api_key_missing' });
        }

        const { droneId, mode, timestamp, eventType, imageBase64 } = req.body || {};

        if (!imageBase64) {
            return res.status(400).json({ error: 'imageBase64 is required' });
        }

        const payload = {
            model: QWEN_VL_MODEL,
            input: {
                messages: [
                    {
                        role: 'system',
                        content: [{ text: buildAnalyzePrompt() }]
                    },
                    {
                        role: 'user',
                        content: [
                            { image: imageBase64 },
                            {
                                text: `droneId=${droneId || ''}, mode=${mode || ''}, eventType=${eventType || ''}, timestamp=${timestamp || ''}`
                            }
                        ]
                    }
                ]
            },
            parameters: {
                temperature: 0.2
            }
        };

        const result = await callQwen(payload);
        const text = extractQwenText(result);
        const parsed = parseJsonSafely(text);
        const structured = normalizeStructuredResult(parsed);

        return res.json({
            ok: true,
            structured,
            rawText: text
        });
    } catch (err) {
        const isTimeout = err?.name === 'AbortError' || err?.name === 'TimeoutError';

        console.error('multimodal analyze error:', err);

        return res.status(isTimeout ? 504 : 500).json({
            error: isTimeout ? 'multimodal_timeout' : 'multimodal_internal_error',
            detail: err.message
        });
    }
});

router.post('/followup', async (req, res) => {
    try {
        if (!QWEN_API_KEY) {
            return res.status(500).json({ error: 'qwen_api_key_missing' });
        }

        const { question, structured, imageBase64 } = req.body || {};

        if (!question) {
            return res.status(400).json({ error: 'question is required' });
        }

        if (!structured) {
            return res.status(400).json({ error: 'structured context is required' });
        }

        const userContent = [];

        if (imageBase64) {
            userContent.push({ image: imageBase64 });
        }

        userContent.push({
            text: [
                `用户追问：${question}`,
                `上一轮结构化检测结果：${JSON.stringify(structured)}`
            ].join('\n')
        });

        const payload = {
            model: QWEN_VL_MODEL,
            input: {
                messages: [
                    {
                        role: 'system',
                        content: [{ text: buildFollowupPrompt() }]
                    },
                    {
                        role: 'user',
                        content: userContent
                    }
                ]
            },
            parameters: {
                temperature: 0.35
            }
        };

        const result = await callQwen(payload);
        const answer = normalizeAnswerText(extractQwenText(result));

        return res.json({
            ok: true,
            answer
        });
    } catch (err) {
        const isTimeout = err?.name === 'AbortError' || err?.name === 'TimeoutError';

        console.error('multimodal followup error:', err);

        return res.status(isTimeout ? 504 : 500).json({
            error: isTimeout ? 'multimodal_timeout' : 'multimodal_followup_error',
            detail: err.message
        });
    }
});

async function callQwen(payload) {
    const response = await fetch(
        'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${QWEN_API_KEY}`
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(MULTIMODAL_TIMEOUT_MS)
        }
    );

    if (!response.ok) {
        const errText = await response.text();
        const err = new Error(errText || `Qwen request failed with ${response.status}`);
        err.status = response.status;
        throw err;
    }

    return response.json();
}

function buildAnalyzePrompt() {
    return `
你是一个“无人机交通场景多模态分析助手”，负责分析无人机俯视交通画面。

输入说明：
1. 输入图像为当前交通路况图像。
2. 图像中可能已经叠加目标检测框，这些检测框是辅助线索。
3. 你需要结合图像内容与检测框线索，输出严格 JSON 格式的交通分析结果。

输出要求：
1. 只能返回合法 JSON。
2. 不允许输出 JSON 之外的任何文字。
3. 所有文本必须使用简体中文。
4. 不允许输出 markdown。
5. 不允许中英混杂。
6. 不允许输出英文句子。

返回 JSON 结构必须严格如下：
{
  "scene_overview": {
    "title": "当前路况",
    "description": "一句中文场景描述"
  },
  "scene_context": {
    "type": "highway|intersection|urban_road|parking_lot|bridge|unknown",
    "label": "高速道路|交叉路口|城市道路|停车区域|桥梁道路|道路场景",
    "description": "一句中文道路场景说明"
  },
  "vehicle_statistics": [
    {
      "type": "car|bus|truck|motorcycle|other",
      "label": "小汽车|公交车|货车|摩托车|其他车辆",
      "count": 0,
      "icon": "car|bus|truck|motorcycle|other"
    }
  ],
  "risk_assessment": {
    "level": "high|medium|low",
    "label": "高风险|一般风险|低风险",
    "color": "red|yellow|green",
    "summary": "一句中文风险总结"
  },
  "expert_analysis": [
    "中文分析要点1",
    "中文分析要点2"
  ],
  "expert_suggestion": [
    "中文建议1",
    "中文建议2"
  ]
}

规则：
1. vehicle_statistics 必须列出主要车辆类型和数量。
2. 如果画面中没有某类车辆，可以不返回该项。
3. scene_context 必须判断当前道路场景类型，用于前端图标化展示。
4. 风险等级必须严格三选一：
   - high / 高风险 / red
   - medium / 一般风险 / yellow
   - low / 低风险 / green
5. 如果当前画面未发现明显危险，必须输出 low、低风险、green。
6. expert_analysis 必须是面向交通场景的中文分点分析。
7. expert_suggestion 必须是中文分点建议。
8. 严禁出现 Aerial view、Traffic、Monitor、Low Risk 等英文内容。
`.trim();
}

function buildFollowupPrompt() {
    return `
你是无人机交通场景多模态分析助手。
你需要基于上一轮结构化检测结果和用户追问进行回答。

回答要求：
1. 必须使用简体中文。
2. 不允许中英混杂。
3. 不允许输出 JSON。
4. 不允许输出 markdown 代码块。
5. 回答要简洁、专业、直接。
6. 如果用户追问无法从已有检测结果判断，必须明确说明“当前画面信息不足，需要结合后续帧继续判断”。
7. 不要编造没有出现在结构化结果中的严重风险。
`.trim();
}

function extractQwenText(result) {
    const output = result?.output || {};

    if (typeof output.text === 'string') {
        return output.text;
    }

    const content = output?.choices?.[0]?.message?.content;

    if (typeof content === 'string') {
        return content;
    }

    if (Array.isArray(content)) {
        const joined = content
            .map(item => item?.text || item?.content || '')
            .filter(Boolean)
            .join('\n')
            .trim();

        if (joined) return joined;
    }

    return JSON.stringify(result || {});
}

function parseJsonSafely(text) {
    try {
        return JSON.parse(text);
    } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) {
            throw new Error('model did not return valid JSON');
        }
        return JSON.parse(match[0]);
    }
}

function normalizeStructuredResult(data) {
    return {
        scene_overview: normalizeSceneOverview(data),
        scene_context: normalizeSceneContext(data),
        vehicle_statistics: normalizeVehicleStatistics(data),
        risk_assessment: normalizeRiskAssessment(data),
        expert_analysis: normalizeExpertAnalysis(data),
        expert_suggestion: normalizeExpertSuggestion(data)
    };
}

function normalizeSceneOverview(data) {
    const scene = data?.scene_overview || data?.scene_image || {};
    const description = normalizeChineseText(
        scene?.description || data?.scene_summary,
        '当前道路整体通行状态较为稳定，建议持续监测。'
    );

    return {
        title: '当前路况',
        description
    };
}

function normalizeSceneContext(data) {
    const context = data?.scene_context || {};
    const scene = data?.scene_overview || data?.scene_image || {};
    const type = normalizeSceneType(context?.type || scene?.type);

    return {
        type,
        label: normalizeChineseText(context?.label, getSceneLabel(type)),
        description: normalizeChineseText(
            context?.description || scene?.description || data?.scene_summary,
            '当前画面属于道路交通监测场景。'
        )
    };
}

function normalizeVehicleStatistics(data) {
    const directList = Array.isArray(data?.vehicle_statistics) ? data.vehicle_statistics : [];
    const legacyByType = data?.vehicle_analysis?.by_type || {};

    let list = [];

    if (directList.length) {
        list = directList.map(item => {
            const type = normalizeVehicleType(item?.type || item?.icon);
            return {
                type,
                label: VEHICLE_LABEL_MAP[type],
                count: Math.max(0, Number(item?.count || 0)),
                icon: type
            };
        });
    } else {
        const legacyTypes = ['car', 'bus', 'truck', 'motorcycle', 'other'];
        list = legacyTypes.map(type => ({
            type,
            label: VEHICLE_LABEL_MAP[type],
            count: Math.max(0, Number(legacyByType?.[type] || 0)),
            icon: type
        }));
    }

    return list
        .filter(item => item.count > 0)
        .sort((a, b) => b.count - a.count);
}

function normalizeRiskAssessment(data) {
    const rawRisk = data?.risk_assessment || {};
    const level = normalizeRiskLevel(rawRisk?.level || deriveLegacyRiskLevel(data?.risk_analysis));
    const meta = RISK_META_MAP[level];

    return {
        level,
        label: meta.label,
        color: meta.color,
        summary: normalizeChineseText(
            rawRisk?.summary || deriveLegacyRiskSummary(level, data?.risk_analysis),
            defaultRiskSummary(level)
        )
    };
}

function normalizeExpertAnalysis(data) {
    const source = Array.isArray(data?.expert_analysis) ? data.expert_analysis : [];
    const normalized = source
        .map(item => normalizeChineseText(item, ''))
        .filter(Boolean);

    if (normalized.length) return normalized;

    const sceneDescription = normalizeSceneOverview(data).description;
    const riskSummary = normalizeRiskAssessment(data).summary;
    const vehicles = normalizeVehicleStatistics(data);

    const vehicleText = vehicles.length
        ? `当前识别到的主要车辆类型为：${vehicles.map(item => `${item.label}${item.count}辆`).join('，')}。`
        : '当前画面中未识别到明显车辆目标。';

    return [
        sceneDescription,
        vehicleText,
        riskSummary
    ];
}

function normalizeExpertSuggestion(data) {
    const source = Array.isArray(data?.expert_suggestion)
        ? data.expert_suggestion
        : Array.isArray(data?.operation_suggestions)
            ? data.operation_suggestions
            : [];

    const normalized = source
        .map(item => normalizeChineseText(item, ''))
        .filter(Boolean);

    if (normalized.length) return normalized;

    const level = normalizeRiskAssessment(data).level;

    if (level === 'high') {
        return [
            '建议立即关注高风险区域，并结合连续画面确认是否需要人工介入。',
            '建议同步联动数据中心与 GIS 页面进行重点告警。'
        ];
    }

    if (level === 'medium') {
        return [
            '建议持续观察当前区域车流变化，防止局部风险扩大。',
            '建议结合后续连续帧判断是否出现拥堵或异常停车。'
        ];
    }

    return [
        '建议继续保持当前监测。',
        '若后续车流密度明显上升，可触发进一步分析。'
    ];
}

function normalizeVehicleType(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'car') return 'car';
    if (raw === 'bus') return 'bus';
    if (raw === 'truck') return 'truck';
    if (raw === 'motorcycle') return 'motorcycle';
    return 'other';
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

function normalizeRiskLevel(value) {
    const raw = String(value || '').trim().toLowerCase();

    if (raw === 'high' || raw === '高风险' || raw === '高') return 'high';
    if (raw === 'medium' || raw === '一般风险' || raw === '中') return 'medium';
    if (raw === 'low' || raw === '低风险' || raw === '低') return 'low';

    return 'low';
}

function deriveLegacyRiskLevel(riskList) {
    const list = Array.isArray(riskList) ? riskList : [];
    const levels = list.map(item => normalizeRiskLevel(item?.severity));

    if (levels.includes('high')) return 'high';
    if (levels.includes('medium')) return 'medium';
    return 'low';
}

function deriveLegacyRiskSummary(level, riskList) {
    const list = Array.isArray(riskList) ? riskList : [];

    if (list.length) {
        const first = list[0];
        return normalizeChineseText(first?.description || first?.title, defaultRiskSummary(level));
    }

    return defaultRiskSummary(level);
}

function defaultRiskSummary(level) {
    if (level === 'high') {
        return '当前画面存在较明显的交通风险，建议立即重点关注。';
    }

    if (level === 'medium') {
        return '当前画面存在一定风险迹象，建议持续观察。';
    }

    return '当前画面未发现明显危险，整体风险较低。';
}

function normalizeChineseText(value, fallback = '') {
    const text = String(value || '').trim();
    if (!text) return fallback;
    if (hasEnglishWords(text)) return fallback;
    return text;
}

function normalizeAnswerText(value) {
    const text = String(value || '').trim();

    if (!text) {
        return '当前暂未生成有效回答。';
    }

    if (hasEnglishWords(text)) {
        return '当前回答中包含不符合要求的内容，建议重新提问或重新检测当前画面。';
    }

    return text;
}

function hasEnglishWords(text) {
    return /[A-Za-z]{3,}/.test(String(text || ''));
}

module.exports = router;

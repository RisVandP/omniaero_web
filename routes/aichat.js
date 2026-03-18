const express = require('express');
const router = express.Router();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const pool = require('../config/db'); // 确保引入了你的数据库连接池

// 1. 鉴权中间件 (保持不变)
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ message: "请先登录" });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: "登录失效" });
        req.user = user;
        next();
    });
};

// 2. 多模型配置映射
const AI_CONFIGS = {
    deepseek: {
        baseUrl: 'https://api.deepseek.com/chat/completions',
        apiKey: process.env.AI_API_KEY_DEEPSEEK
    },
    qwen: {
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        apiKey: process.env.AI_API_KEY_QWEN
    }
};

// 3. 获取历史记录接口 (GET)
router.get('/history', authenticateToken, async (req, res) => {
    try {
        // 获取该用户的全量历史上下文 (无限制版)
        const [historyRows] = await pool.query(
            'SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY id ASC',
            [userId]
        );
        res.json({ code: 200, data: historyRows });
    } catch (err) {
        res.status(500).json({ message: "获取历史记录失败" });
    }
});
// 3.5 新增：清空当前用户的历史记录 (DELETE /api/chat/history)
router.delete('/history', authenticateToken, async (req, res) => {
    try {
        // 删除该用户在 chat_history 表中的所有记录
        await pool.query('DELETE FROM chat_history WHERE user_id = ?', [req.user.userId]);
        res.json({ code: 200, message: "历史记录已清空" });
    } catch (err) {
        console.error("清空历史记录失败:", err);
        res.status(500).json({ message: "清空失败，服务器内部错误" });
    }
});

// 4. 实时聊天接口 (POST)
// 4. 实时聊天接口 (POST - 支持视觉大模型)
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { provider, model, message, image } = req.body;
        const userId = req.user.userId;

        if (!provider || !model || !message) return res.status(400).json({ message: "参数不完整" });
        const config = AI_CONFIGS[provider];

        // 1. 将用户的文本提问存入数据库 (注意：绝对不要把几MB的图片Base64存进数据库)
        await pool.query('INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)', [userId, 'user', message]);

        // 获取该用户的全量历史上下文
        const [historyRows] = await pool.query(
            'SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY id ASC',
            [userId]
        );
        
        // 组装消息体
        const messages = [
            {"role": "system", "content": "你是 OmniAero 无人机平台的高级视觉与交通态势分析助手。请专业、精确地回答用户的问题。"}
        ];
        
        historyRows.forEach(row => {
            messages.push({ role: row.role === 'agent' ? 'assistant' : 'user', content: row.content });
        });

        // 【视觉核心】：赋予 AI 眼睛！
        // 如果前端传来了图片，且用户选择了带有 'vl' 的视觉模型
        if (image && model.includes('vl')) {
            const lastMsg = messages[messages.length - 1]; // 找到当前这轮对话
            if (lastMsg.role === 'user') {
                // 将普通的文本结构改写为 OpenAI 兼容的多模态数组结构
                lastMsg.content = [
                    { type: "image_url", image_url: { url: image } },
                    { type: "text", text: message }
                ];
            }
        }

        // 2. 调用大模型 API
        const response = await axios.post(config.baseUrl, {
            model: model, 
            messages: messages,
            temperature: 0.3,
            stream: false
        }, {
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` }
        });

        // 提取回复内容（兼容不同模型的数据结构）
        let reply = response.data.choices[0].message.content || response.data.choices[0].message.reasoning_content || "";
        
        // 3. 将 AI 的回复存入数据库
        await pool.query('INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)', [userId, 'agent', reply]);

        res.json({ code: 200, data: { reply: reply, provider, model } });

    } catch (error) {
        console.error("❌ AI 接口失败:", error.response?.data || error.message);
        // 精准抓取大模型的真实报错并返回给前端
        const errMsg = error.response?.data?.error?.message || "大模型思考失败，请检查控制台报错";
        res.status(500).json({ message: errMsg });
    }
});

module.exports = router;
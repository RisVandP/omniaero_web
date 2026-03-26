require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); 

// 1. 引入拆分出来的独立模块
const authRoutes = require('./routes/auth');//登录注册
const chatRoutes = require('./routes/aichat'); 
const detectionRoutes = require('./routes/detection'); // 检测模块
// 2. 挂载路由
app.use('/api/auth', authRoutes); // 把注册/登录请求交给 auth.js
app.use('/api/chat', chatRoutes); // 把 AI 对话请求交给 chat.js
app.use('/api/detection', detectionRoutes);
// 3. 启动服务
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0',() => {
    console.log(`🚀 无人机平台后端已启动，正在监听端口: http://localhost:${PORT}`);
});
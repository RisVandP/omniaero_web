require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/aichat');
const detectionRoutes = require('./routes/detection');
const multimodalRoutes = require('./routes/multimodal');


const app = express();

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static('public'));


app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/detection', detectionRoutes);
app.use('/api/multimodal', multimodalRoutes);


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`无人机平台后端已启动，正在监听端口: http://localhost:${PORT}`);
});

# OmniAero Web

无人机交通场景监测平台，包含 Express 后端、静态前端、用户登录、图片检测、多模态画面分析和少量演示视频素材。

## Quick Start

```bash
npm install
copy .env.example .env
npm start
```

访问 `http://localhost:3000`。

## Environment

主要环境变量见 `.env.example`：

- `DB_HOST` / `DB_USER` / `DB_PASSWORD` / `DB_NAME`：MySQL 连接配置
- `JWT_SECRET`：登录令牌密钥
- `AI_API_KEY_QWEN`：通义千问视觉模型 API Key
- `PYTHON_EXECUTABLE`：运行检测脚本的 Python 命令
- `YOLO_MODEL_PATH`：YOLO 权重路径，默认 `best.pt`

## Repository Slimming

仓库只保留平台运行主干、1 号无人机页面使用的 `test.png` / `test1.png`、每台无人机 RGB/红外各一张代表帧，以及 `public/Video/无人机04号` 的轻量演示视频。其余完整素材仍保留在本地，不进入 Git：

- `node_modules/`
- 构建产物 `dist/`
- 上传结果 `public/uploads/*`
- 大模型权重 `*.pt`
- 大批量视频帧和完整无人机视频数据
- 临时文档、评审材料、报告生成工具

代表帧用于查看和演示素材，不会被当前页面自动串成视频。2、3 号无人机如需播放动态画面，需要另行提供对应路径下的 MP4。多模态自动检测使用当前画面作为输入，仍需在部署环境配置 `AI_API_KEY_QWEN` 才能调用真实视觉模型。

部署时如需在线 YOLO 推理，请在服务器上单独放置模型权重，并通过 `YOLO_MODEL_PATH` 指向该文件。

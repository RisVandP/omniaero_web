# Dashboard 视频加载与YOLO实时检测教程

## ? 概述
本教程将指导您实现在dashboard中上传本地视频，并使用YOLO模型进行实时逐帧检测，最后将结果显示在前端。

---

## ? 整体架构

```
前端 (dashboard.html)
    ↓ 上传视频文件
后端 (Node.js - detection.js)
    ↓ 分解视频帧、调用Python
Python (detect.py)
    ↓ YOLO逐帧检测
    ↑ 返回检测结果
前端 (WebSocket接收实时结果)
    ↓ 显示检测画面和统计数据
```

---

## 第一步：修改后端 API - 支持视频的检测接口

### 文件：`routes/detection.js`

在现有的检测路由中添加视频检测端点：

```javascript
// 在 detection.js 顶部添加这些导入
const ffmpeg = require('fluent-ffmpeg');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// 配置 ffmpeg 路径（如果系统中已安装，可以省略）
ffmpeg.setFfmpegPath('ffmpeg');

// ========== 视频检测端点 ==========
router.post('/run-video', upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "未接收到视频文件" });
    }

    const videoPath = req.file.path;
    const videoName = path.basename(videoPath, path.extname(videoPath));
    const framesDir = path.join(__dirname, `../public/uploads/${videoName}_frames`);
    const resultDir = path.join(__dirname, `../public/uploads/${videoName}_result`);

    // 创建输出目录
    if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });
    if (!fs.existsSync(resultDir)) fs.mkdirSync(resultDir, { recursive: true });

    // 返回处理ID，前端通过这个ID查询进度
    const processId = videoName;
    
    res.json({
        success: true,
        processId: processId,
        message: "视频处理已启动，请通过WebSocket连接获取实时进度"
    });

    // 后台异步处理视频（不阻塞HTTP响应）
    processVideoInBackground(videoPath, framesDir, resultDir, processId);
});

// WebSocket 接口用于实时推送检测进度
const wss = new WebSocket.Server({ noServer: true });

// ========== 后台视频处理函数 ==========
function processVideoInBackground(videoPath, framesDir, resultDir, processId) {
    console.log(`[${processId}] 开始提取视频帧...`);

    // 第一步：使用ffmpeg解析视频并提取所有帧
    ffmpeg(videoPath)
        .on('filenames', (filenames) => {
            console.log(`[${processId}] 开始提取帧:`, filenames);
        })
        .on('error', (err) => {
            console.error(`[${processId}] FFmpeg错误:`, err);
            broadcastProgress(processId, { status: 'error', message: err.message });
        })
        .on('end', () => {
            console.log(`[${processId}] 帧提取完成，开始YOLO检测...`);
            // 第二步：获取所有帧文件并依次进行YOLO检测
            detectFrames(framesDir, resultDir, processId);
        })
        .output(path.join(framesDir, 'frame_%05d.jpg'))
        .outputOptions('-q:v', '2') // 高质量（1-31，数字越小质量越好）
        .run();
}

// ========== 帧检测函数 ==========
function detectFrames(framesDir, resultDir, processId) {
    const frames = fs.readdirSync(framesDir)
        .filter(f => f.endsWith('.jpg'))
        .sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)[0]);
            const numB = parseInt(b.match(/\d+/)[0]);
            return numA - numB;
        });

    let processedCount = 0;
    const totalFrames = frames.length;
    const detectionResults = [];

    console.log(`[${processId}] 共需处理 ${totalFrames} 帧`);

    // 使用队列处理以控制并发
    const maxConcurrent = 4; // 同时处理4个帧
    let currentIndex = 0;

    function processNextBatch() {
        const batch = [];
        
        while (currentIndex < frames.length && batch.length < maxConcurrent) {
            batch.push(frames[currentIndex]);
            currentIndex++;
        }

        if (batch.length === 0) {
            // 所有帧处理完成
            console.log(`[${processId}] 所有帧处理完成！`);
            broadcastProgress(processId, {
                status: 'completed',
                totalFrames: totalFrames,
                results: detectionResults,
                message: '检测完成'
            });
            return;
        }

        // 并发处理此批帧
        batch.forEach((frame, batchIndex) => {
            const frameIndex = currentIndex - batch.length + batchIndex;
            const framePath = path.join(framesDir, frame);
            const resultPath = path.join(resultDir, `detected_${frame}`);

            detectSingleFrame(framePath, resultPath, processId, frameIndex, totalFrames)
                .then((result) => {
                    detectionResults.push(result);
                    processedCount++;

                    // 广播进度
                    broadcastProgress(processId, {
                        status: 'processing',
                        processedFrames: processedCount,
                        totalFrames: totalFrames,
                        currentFrame: frameIndex + 1,
                        progress: Math.round((processedCount / totalFrames) * 100),
                        latestResult: result
                    });

                    // 如果该批完成，继续处理下一批
                    if (processedCount % maxConcurrent === 0 || processedCount === totalFrames) {
                        processNextBatch();
                    }
                })
                .catch((err) => {
                    console.error(`[${processId}] 帧 ${frameIndex} 检测失败:`, err);
                    processedCount++;
                });
        });
    }

    processNextBatch();
}

// ========== 单帧检测函数 ==========
function detectSingleFrame(inputPath, outputPath, processId, frameIndex, totalFrames) {
    return new Promise((resolve, reject) => {
        const pythonExecutable = 'F:\\anaconda1\\envs\\yolo\\python.exe'; // 修改为自己的Python路径

        const pythonProcess = spawn(pythonExecutable, ['detect.py', inputPath, outputPath]);

        let pythonOutput = '';

        pythonProcess.stdout.on('data', (data) => {
            pythonOutput += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            console.error(`[${processId}] Python错误 (帧${frameIndex}): ${data}`);
        });

        pythonProcess.on('close', (code) => {
            if (code === 0 && pythonOutput.includes('SUCCESS_JSON:')) {
                try {
                    const jsonStr = pythonOutput.split('SUCCESS_JSON:')[1].trim();
                    const detections = JSON.parse(jsonStr);
                    resolve({
                        frameIndex: frameIndex,
                        totalFrames: totalFrames,
                        detections: detections,
                        outputImage: `/uploads/${path.basename(outputPath)}`
                    });
                } catch (err) {
                    reject(err);
                }
            } else {
                reject(new Error('Detection failed'));
            }
        });

        pythonProcess.on('error', (err) => {
            reject(err);
        });
    });
}

// ========== WebSocket 广播函数 ==========
function broadcastProgress(processId, data) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client.processId === processId) {
            client.send(JSON.stringify({
                processId: processId,
                timestamp: new Date().toISOString(),
                ...data
            }));
        }
    });
}

module.exports = router;
```

---

## 第二步：修改 Python 脚本 - 支持视频处理

### 文件：`detect.py`

```python
# -*- coding: utf-8 -*-
import sys
import io
import json
import cv2
from ultralytics import YOLO

# 强制将 Python 的控制台输出设为 UTF-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf8')

def run_detection(input_path, output_path):
    """
    对输入的图片或视频进行 YOLO 检测
    :param input_path: 输入文件路径（图片或视频）
    :param output_path: 输出文件路径
    """
    try:
        # 加载 YOLO 模型（使用自己的 best.pt）
        model = YOLO('best.pt')
        
        # 检查输入是否为视频
        if input_path.lower().endswith(('.mp4', '.avi', '.mov', '.mkv')):
            detect_video(model, input_path, output_path)
        else:
            # 图片检测（原有逻辑）
            detect_image(model, input_path, output_path)
            
    except Exception as e:
        print(f"ERROR: {str(e)}")

def detect_image(model, input_path, output_path):
    """单帧或图片检测"""
    results = model(input_path, verbose=False)
    results[0].save(filename=output_path)
    
    # 统计检测结果
    counts = {"bus": 0, "car": 0, "freight": 0, "truck": 0, "van": 0}
    names = model.names
    for box in results[0].boxes:
        cls_name = names[int(box.cls)].lower()
        if "bus" in cls_name: counts["bus"] += 1
        elif "freight" in cls_name: counts["freight"] += 1
        elif "truck" in cls_name: counts["truck"] += 1
        elif "van" in cls_name: counts["van"] += 1
        else: counts["car"] += 1
    
    print("SUCCESS_JSON:" + json.dumps(counts))

def detect_video(model, input_path, output_path):
    """
    视频检测 - 逐帧处理
    """
    cap = cv2.VideoCapture(input_path)
    
    if not cap.isOpened():
        raise Exception(f"无法打开视频文件: {input_path}")
    
    # 获取视频信息
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    # 初始化视频写入器
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (frame_width, frame_height))
    
    frame_count = 0
    total_counts = {"bus": 0, "car": 0, "freight": 0, "truck": 0, "van": 0}
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        # 对当前帧进行检测
        results = model(frame, verbose=False)
        
        # 在帧上绘制检测结果
        annotated_frame = results[0].plot()
        
        # 统计检测结果
        names = model.names
        for box in results[0].boxes:
            cls_name = names[int(box.cls)].lower()
            if "bus" in cls_name: total_counts["bus"] += 1
            elif "freight" in cls_name: total_counts["freight"] += 1
            elif "truck" in cls_name: total_counts["truck"] += 1
            elif "van" in cls_name: total_counts["van"] += 1
            else: total_counts["car"] += 1
        
        # 写入输出视频
        out.write(annotated_frame)
        frame_count += 1
        
        # 每 10 帧输出一次进度
        if frame_count % 10 == 0:
            progress = (frame_count / total_frames) * 100
            print(f"Processing: {progress:.1f}% ({frame_count}/{total_frames})", flush=True)
    
    cap.release()
    out.release()
    
    # 输出最终统计结果
    print("SUCCESS_JSON:" + json.dumps(total_counts))

if __name__ == '__main__':
    run_detection(sys.argv[1], sys.argv[2])
```

---

## 第三步：修改前端 HTML - 添加视频上传和实时进度展示

### 文件：`public/dashboard.html`

在现有的 HTML 中增加以下部分：

```html
<!-- 在 dashboard.html 的 <style> 中添加 -->
<style>
    /* ...现有样式... */
    
    /* 视频上传区域样式 */
    .upload-zone {
        border: 2px dashed var(--cb);
        border-radius: 12px;
        padding: 32px;
        text-align: center;
        background: rgba(59, 130, 246, 0.05);
        cursor: pointer;
        transition: all 0.2s;
        margin-bottom: 16px;
    }
    .upload-zone:hover {
        background: rgba(59, 130, 246, 0.1);
        border-color: var(--cc);
    }
    .upload-zone.dragover {
        border-color: var(--cc);
        background: rgba(59, 130, 246, 0.15);
    }
    
    /* 进度条样式 */
    .progress-bar {
        width: 100%;
        height: 8px;
        background: rgba(59, 130, 246, 0.1);
        border-radius: 4px;
        overflow: hidden;
        margin: 12px 0;
    }
    .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--cb), var(--cc));
        width: 0%;
        transition: width 0.3s ease;
        border-radius: 4px;
    }
    
    /* 检测结果面板 */
    .detection-stats {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 12px;
        margin-top: 16px;
    }
    .stat-card {
        background: rgba(59, 130, 246, 0.05);
        border: 1px solid rgba(59, 130, 246, 0.2);
        border-radius: 8px;
        padding: 12px;
        text-align: center;
    }
    .stat-label {
        font-size: 12px;
        color: var(--cm);
        margin-bottom: 4px;
    }
    .stat-value {
        font-size: 24px;
        font-weight: 700;
        color: var(--cb);
    }
</style>

<!-- 在 HTML body 中添加新的面板 -->
<div class="dc">
    <div class="fleet-grid">
        <div class="panel">
            <div class="panel-header">
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                </svg>
                本地视频上传
            </div>
            <div style="padding: 20px; flex: 1; display: flex; flex-direction: column;">
                <div class="upload-zone" id="upload-zone">
                    <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin: 0 auto 12px; opacity: 0.5;">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                    </svg>
                    <p style="margin: 0 0 8px; color: var(--ct); font-weight: 600;">拖拽视频文件到此或点击上传</p>
                    <p style="margin: 0; font-size: 12px; color: var(--cm);">支持 MP4, AVI, MOV 等格式</p>
                    <input type="file" id="video-input" accept="video/*" style="display: none;">
                </div>
                
                <div id="status-area" style="display: none;">
                    <div style="font-size: 14px; font-weight: 600; color: var(--ct); margin-bottom: 8px;">
                        处理进度：<span id="progress-text">0%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" id="progress-fill"></div>
                    </div>
                    <div style="font-size: 12px; color: var(--cm); margin-top: 8px;">
                        <span id="status-message">正在上传...</span>
                    </div>
                    <div class="detection-stats" id="detection-stats"></div>
                </div>
            </div>
        </div>

        <div class="panel">
            <div class="panel-header" style="justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 8px; color: #ea580c;">
                    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.069A1 1 0 0121 8.868V15.131a1 1 0 01-1.447.898L15 14M3 8a2 2 0 00-2 2v4a2 2 0 002 2h8a2 2 0 002-2V10a2 2 0 00-2-2H3z"/>
                    </svg>
                    实时检测画面
                </div>
                <span id="current-drone-label" style="font-size: 12px; color: var(--cm); font-weight: normal;">等待上传视频...</span>
            </div>
            <div class="video-container">
                <video id="main-video" autoplay muted controls style="width: 100%; height: 100%;"></video>
                <div id="video-placeholder" class="placeholder-text">
                    <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="opacity: 0.5;">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.868V15.131a1 1 0 01-1.447.898L15 14M3 8a2 2 0 00-2 2v4a2 2 0 002 2h8a2 2 0 002-2V10a2 2 0 00-2-2H3z"/>
                    </svg>
                    <span>请上传本地视频文件以开始检测</span>
                </div>
            </div>
        </div>
    </div>
</div>
```

---

## 第四步：前端 JavaScript - 处理上传和实时进度

在 `dashboard.html` 的 `<script>` 底部添加：

```javascript
// ========== 视频上传功能 ==========
const uploadZone = document.getElementById('upload-zone');
const videoInput = document.getElementById('video-input');
const statusArea = document.getElementById('status-area');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const statusMessage = document.getElementById('status-message');
const detectionStatsContainer = document.getElementById('detection-stats');

// 拖拽上传
uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleVideoUpload(files[0]);
    }
});

// 点击上传
uploadZone.addEventListener('click', () => {
    videoInput.click();
});

videoInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleVideoUpload(e.target.files[0]);
    }
});

// 处理视频上传
function handleVideoUpload(file) {
    const formData = new FormData();
    formData.append('video', file);
    
    console.log(`开始上传视频: ${file.name}`);
    statusArea.style.display = 'block';
    statusMessage.textContent = '正在上传视频文件...';
    
    // 上传视频
    fetch('/api/detection/run-video', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log(`视频处理已启动，Process ID: ${data.processId}`);
            statusMessage.textContent = '视频已上传，正在准备处理...';
            
            // 连接 WebSocket 接收实时进度
            connectWebSocket(data.processId, file.name);
        } else {
            statusMessage.textContent = '错误: ' + (data.message || '上传失败');
        }
    })
    .catch(error => {
        console.error('上传错误:', error);
        statusMessage.textContent = '上传失败: ' + error.message;
    });
}

// WebSocket 连接处理实时进度
function connectWebSocket(processId, fileName) {
    const wsUrl = `ws://${window.location.host}/api/detection/progress/${processId}`;
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket 已连接');
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('收到进度更新:', data);
        
        if (data.status === 'processing') {
            const progress = data.progress || 0;
            progressFill.style.width = progress + '%';
            progressText.textContent = progress + '%';
            statusMessage.textContent = `处理中... 第 ${data.currentFrame} / ${data.totalFrames} 帧`;
            
            // 更新检测统计
            if (data.latestResult && data.latestResult.detections) {
                updateDetectionStats(data.latestResult.detections);
            }
        } else if (data.status === 'completed') {
            progressFill.style.width = '100%';
            progressText.textContent = '100%';
            statusMessage.textContent = '检测完成！';
            document.getElementById('current-drone-label').textContent = `已处理: ${fileName}`;
            
            // 显示最终统计
            if (data.results && data.results.length > 0) {
                updateDetectionStats(data.results[data.results.length - 1].detections);
            }
            
            ws.close();
        } else if (data.status === 'error') {
            statusMessage.textContent = '错误: ' + data.message;
            ws.close();
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket 错误:', error);
        statusMessage.textContent = 'WebSocket 连接失败';
    };
    
    ws.onclose = () => {
        console.log('WebSocket 连接已关闭');
    };
}

// 更新检测统计显示
function updateDetectionStats(detections) {
    detectionStatsContainer.innerHTML = '';
    
    const labels = {
        'bus': '公交车',
        'car': '小汽车',
        'freight': '货车',
        'truck': '大货车',
        'van': '面包车'
    };
    
    Object.keys(labels).forEach(key => {
        const count = detections[key] || 0;
        const card = document.createElement('div');
        card.className = 'stat-card';
        card.innerHTML = `
            <div class="stat-label">${labels[key]}</div>
            <div class="stat-value">${count}</div>
        `;
        detectionStatsContainer.appendChild(card);
    });
}
```

---

## 第五步：安装必要的 Node.js 依赖

运行以下命令在项目根目录安装依赖：

```bash
npm install fluent-ffmpeg ws
```

或者在 `package.json` 中添加：

```json
{
    "dependencies": {
        "fluent-ffmpeg": "^2.1.2",
        "ws": "^8.13.0"
    }
}
```

---

## 第六步：配置 FFmpeg

### Windows 环境

1. 下载 FFmpeg：https://ffmpeg.org/download.html
2. 解压到某个路径（例如：`C:\ffmpeg`）
3. 将 `bin` 目录加入系统 PATH 环境变量，或在代码中指定路径：

```javascript
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath('C:\\ffmpeg\\bin\\ffmpeg.exe');
```

### Linux/Mac 环境

```bash
# Ubuntu/Debian
sudo apt-get install ffmpeg

# macOS
brew install ffmpeg
```

---

## 第七步：完整工作流程

1. **启动服务器**：
   ```bash
   npm start
   ```

2. **访问 dashboard**：
   打开浏览器 `http://localhost:3000/dashboard.html`

3. **上传视频**：
   - 拖拽或点击上传本地视频文件
   - 支持格式：MP4, AVI, MOV, MKV 等

4. **实时监控**：
   - 前端通过 WebSocket 实时接收检测进度
   - 显示进度条和统计数据
   - 处理完成后显示最终结果

5. **查看结果**：
   - 检测结果视频保存在 `public/uploads/[videoname]_result/`
   - 统计数据实时显示在前端面板

---

## ? 故障排查

### 1. "Python not found" 错误
- 检查 `detection.js` 中的 Python 路径是否正确
- 运行命令获取路径：
  ```bash
  where python  # Windows
  which python  # Linux/Mac
  ```

### 2. "FFmpeg not found" 错误
- 确保 FFmpeg 已安装且在 PATH 中
- 或在代码中明确指定 FFmpeg 路径

### 3. YOLO 模型加载失败
- 检查 `best.pt` 文件是否存在于项目根目录
- 确保 `ultralytics` 库已安装：
  ```bash
  pip install ultralytics
  ```

### 4. WebSocket 连接失败
- 检查服务器是否支持 WebSocket
- 查看浏览器控制台的错误日志

---

## ? 性能优化建议

1. **使用并行处理**：同时处理多个视频帧以提高速度
2. **调整检测精度**：修改 YOLO 的 `conf` 参数，降低计算量
3. **压缩视频输出**：调整 FFmpeg 的编码参数以减小输出文件大小
4. **分片上传**：对于大视频文件，考虑使用分片上传方案

---

## ? 扩展功能

### 1. 实时视频流检测（WebRTC）
使用 WebRTC 进行实时摄像头或视频流检测

### 2. 多视频并行处理
支持同时上传多个视频，后端队列管理

### 3. 检测结果导出
将检测结果导出为 JSON、CSV 或视频文件

### 4. 历史记录管理
保存所有检测任务的历史记录和统计数据

---

## ? 相关资源

- YOLO 官方文档：https://docs.ultralytics.com/
- FFmpeg 文档：https://ffmpeg.org/documentation.html
- Node.js WebSocket：https://github.com/websockets/ws

---

希望这个教程能帮助您实现视频检测功能！有任何问题欢迎提出?

# 简化版：视频本地检测方案

## ? 快速开始指南

如果上面的完整教程过于复杂，这是一个**更简单实用**的实现方案，直接利用现有的逐帧检测能力。

---

## 方案说明

**核心思路**：
1. 前端使用 HTML5 Canvas 或 Java 提取视频帧
2. 逐帧上传到后端进行 YOLO 检测
3. 实时显示检测结果和统计数据

**优点**：
- ? 无需 FFmpeg 依赖
- ? 无需 WebSocket 复杂配置
- ? 完全利用现有的 `/api/detection/run` 接口
- ? 兼容性好，浏览器引擎原生支持

---

## 实现步骤

### 步骤1：修改前端 dashboard.html

在 `style` 中添加：

```html
<style>
    .video-control-panel {
        display: flex;
        gap: 12px;
        margin-bottom: 16px;
        flex-wrap: wrap;
    }
    
    .btn {
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .btn-primary {
        background: var(--cb);
        color: white;
    }
    .btn-primary:hover {
        background: #2563eb;
    }
    
    .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    
    .detection-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
        gap: 12px;
        margin-top: 12px;
    }
    
    .detection-item {
        background: rgba(59, 130, 246, 0.1);
        border: 1px solid rgba(59, 130, 246, 0.2);
        border-radius: 8px;
        padding: 12px;
        text-align: center;
    }
    
    .detection-label {
        font-size: 11px;
        color: var(--cm);
        margin-bottom: 4px;
    }
    
    .detection-count {
        font-size: 24px;
        font-weight: 700;
        color: var(--cb);
    }
    
    .progress-info {
        font-size: 12px;
        color: var(--cm);
        margin-top: 8px;
    }
</style>
```

在 HTML body 中更新左侧面板为：

```html
<div class="panel">
    <div class="panel-header">
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
        </svg>
        本地视频检测
    </div>
    <div style="padding: 20px; flex: 1; display: flex; flex-direction: column;">
        
        <!-- 视频输入 & 控制按钮 -->
        <div class="video-control-panel">
            <input type="file" id="video-file" accept="video/*" style="flex: 1; padding: 6px; border: 1px solid var(--br); border-radius: 6px;">
            <button id="start-detection" class="btn btn-primary" disabled>
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="display: inline; margin-right: 4px;">
                    <path d="M8 5v14l11-7z"/>
                </svg>
                开始检测
            </button>
        </div>
        
        <!-- 帧数显示和进度 -->
        <div class="progress-info">
            <div>当前帧: <span id="current-frame">0</span> / <span id="total-frames">0</span></div>
            <div style="margin-top: 4px;">
                <div style="width: 100%; height: 6px; background: rgba(59,130,246,0.1); border-radius: 3px; overflow: hidden;">
                    <div id="frame-progress" style="width: 0%; height: 100%; background: linear-gradient(90deg, var(--cb), var(--cc)); transition: width 0.3s;"></div>
                </div>
            </div>
        </div>
        
        <!-- 检测统计数据 -->
        <div class="detection-grid" id="detection-stats">
            <div class="detection-item">
                <div class="detection-label">? 公交车</div>
                <div class="detection-count" data-type="bus">0</div>
            </div>
            <div class="detection-item">
                <div class="detection-label">? 小汽车</div>
                <div class="detection-count" data-type="car">0</div>
            </div>
            <div class="detection-item">
                <div class="detection-label">? 货车</div>
                <div class="detection-count" data-type="freight">0</div>
            </div>
            <div class="detection-item">
                <div class="detection-label">? 大货车</div>
                <div class="detection-count" data-type="truck">0</div>
            </div>
            <div class="detection-item">
                <div class="detection-label">? 面包车</div>
                <div class="detection-count" data-type="van">0</div>
            </div>
        </div>
    </div>
</div>
```

在 `<script>` 部分添加以下代码：

```javascript
// ========== 视频帧提取与检测 ==========
const videoInput = document.getElementById('video-file');
const startBtn = document.getElementById('start-detection');
const videoElement = document.getElementById('main-video');
const currentFrameSpan = document.getElementById('current-frame');
const totalFramesSpan = document.getElementById('total-frames');
const frameProgressBar = document.getElementById('frame-progress');

// 用于存储视频帧
let extractedFrames = [];
let isDetecting = false;

// 监听视频文件输入
videoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        // 创建视频预览
        const videoUrl = URL.createObjectURL(file);
        videoElement.src = videoUrl;
        
        // 视频加载完成后提取帧数
        videoElement.addEventListener('loadedmetadata', () => {
            extractedFrames = [];
            totalFramesSpan.textContent = Math.floor(videoElement.duration * 30); // 假设 30fps
            startBtn.disabled = false;
        }, { once: true });
        
        // 显示视频预览
        document.getElementById('video-placeholder').style.display = 'none';
        videoElement.style.display = 'block';
    }
});

// 开始逐帧检测
startBtn.addEventListener('click', async () => {
    if (!videoInput.files[0] || isDetecting) return;
    
    isDetecting = true;
    startBtn.disabled = true;
    
    const VIDEO_FPS = 5; // 每秒提取 5 帧（可调整）
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    
    // 重置视频到开头
    videoElement.currentTime = 0;
    
    let frameCount = 0;
    const detectionResults = {
        bus: 0,
        car: 0,
        freight: 0,
        truck: 0,
        van: 0
    };
    
    // 帧提取函数
    const processFrame = async () => {
        if (videoElement.paused || videoElement.ended) {
            // 检测完成
            console.log('所有帧处理完成!');
            isDetecting = false;
            startBtn.disabled = false;
            updateDetectionDisplay(detectionResults);
            return;
        }
        
        // 绘制当前帧到 canvas
        ctx.drawImage(videoElement, 0, 0);
        
        // 获取帧的 Blob 数据
        canvas.toBlob(async (blob) => {
            // 上传帧进行检测
            const formData = new FormData();
            formData.append('image', blob, `frame_${frameCount}.jpg`);
            
            try {
                const response = await fetch('/api/detection/run', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success && result.data) {
                    // 累加检测结果
                    Object.keys(detectionResults).forEach(key => {
                        detectionResults[key] += result.data[key] || 0;
                    });
                    
                    frameCount++;
                    currentFrameSpan.textContent = frameCount;
                    frameProgressBar.style.width = (frameCount / (videoElement.duration * VIDEO_FPS)) * 100 + '%';
                    
                    updateDetectionDisplay(detectionResults);
                }
            } catch (error) {
                console.error('帧检测失败:', error);
            }
            
            // 跳到下一帧 (1/VIDEO_FPS 秒)
            videoElement.currentTime += 1 / VIDEO_FPS;
        }, 'image/jpeg', 0.8);
    };
    
    // 当视频加载足够数据时开始处理
    videoElement.addEventListener('loadeddata', processFrame);
    
    // 启动播放以加载视频数据
    videoElement.play().catch(e => console.log('播放限制:', e));
});

// 更新检测显示
function updateDetectionDisplay(results) {
    document.querySelectorAll('.detection-count').forEach(el => {
        const type = el.getAttribute('data-type');
        el.textContent = results[type] || 0;
    });
}
```

---

## 使用方式

1. **启动项目**：
   ```bash
   npm start
   ```

2. **打开 dashboard**：
   访问 `http://localhost:3000/dashboard.html`

3. **加载本地视频**：
   - 点击左侧面板中的文件输入框
   - 选择本地视频文件（MP4, AVI 等）

4. **开始检测**：
   - 点击"开始检测"按钮
   - 系统自动逐帧提取并上传到 YOLO 进行检测
   - 实时显示进度和统计结果

---

## 性能调优

### 调整帧率
修改代码中的 `VIDEO_FPS` 值：
- `VIDEO_FPS = 2` → 每秒 2 帧（快速，但可能遗漏目标）
- `VIDEO_FPS = 5` → 每秒 5 帧（平衡）
- `VIDEO_FPS = 10` → 每秒 10 帧（精准，但处理时间长）

### 调整图片质量
修改 `canvas.toBlob` 的最后一个参数：
```javascript
canvas.toBlob(async (blob) => {
    // ...
}, 'image/jpeg', 0.6);  // 0.6 = 60% 质量（降低会更快）
```

---

## ?? 已知限制

1. **浏览器兼容性**：要求现代浏览器（Chrome, Firefox, Edge）
2. **大视频文件**：浏览器需要足够内存来处理视频
3. **串行处理**：逐帧处理速度较慢，建议视频不超过 5 分钟
4. **无结果回放**：当前方案不生成带检测框的视频，只显示统计数据

---

## ? 改进方向

如需进一步优化：

1. **增加结果回放**：修改 Python 的 `detect.py` 返回检测框坐标，前端绘制到视频上
2. **并行处理**：同时上传多个帧而不是串行等待
3. **缓存优化**：缓存重复检测的帧以加快速度
4. **后端视频处理**：采用完整的 WebSocket 方案处理视频

---

## ? 快速FAQ

**Q: 为什么没有生成检测后的视频？**  
A: 本方案只显示统计数据，若需生成带检测框的视频，需要实施这个教程：[完整版本](#)

**Q: 检测速度很慢怎么办？**  
A: 降低 `VIDEO_FPS` 值或减少视频时长，或升级 GPU（在 detect.py 中启用 CUDA）

**Q: 支持哪些视频格式？**  
A: HTML5 video 标签支持的格式：MP4, WebM, Ogg 等（取决于浏览器）

**Q: 能否检测实时摄像头？**  
A: 可以，将 `videoInput` 替换为 `<video>` 标签的 getUserMedia API 即可

---

祝您使用愉快！?

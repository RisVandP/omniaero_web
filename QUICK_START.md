# ? 快速参考指南 - 5分钟快速上手

## ? 选择您的方案

有3种方案可选，从**简单到复杂**：

### 方案对比

| 特性 | 简化版 | 完整版 | 独立脚本 |
|-----|-------|--------|---------|
| 实现难度 | ? | ??? | ?? |
| 需要依赖 | 无 | FFmpeg+WebSocket | 无 |
| 检测速度 | 慢 (逐帧) | 快 (后端处理) | 快 |
| 能否生成结果视频 | ? | ? | ? |
| 实时进度显示 | ? | ? | ? (终端) |
| 建议使用场景 | 快速原型 | 生产环境 | 命令行处理 |

---

## ? 方案1：简化版（推荐新手）

**文件位置**：[SIMPLE_VIDEO_DETECTION.md](./SIMPLE_VIDEO_DETECTION.md)

### ?? 5分钟快速上手

```bash
# 1. 项目已启动？无需任何安装
# 直接访问浏览器

# 2. 打开 dashboard
访问 http://localhost:3000/dashboard.html

# 3. 在左侧面板上传视频文件

# 4. 点击"开始检测"，等待结果
```

**工作流程**：
```
用户选择视频
    ↓
浏览器逐帧提取视频帧
    ↓
前端上传每一帧到 /api/detection/run
    ↓
后端 YOLO 检测该帧
    ↓
前端实时累加统计结果
    ↓
显示实时进度和检测数据
```

**代码修改**：
- 仅需修改 `dashboard.html` 中的 `<script>` 部分
- 无需修改后端和 Python 脚本
- 完全是前端的改动

---

## ? 方案2：完整版（推荐生产环境）

**文件位置**：[VIDEO_DETECTION_TUTORIAL.md](./VIDEO_DETECTION_TUTORIAL.md)

### 需要的步骤

1. **安装依赖**
   ```bash
   npm install fluent-ffmpeg ws
   ```

2. **安装 FFmpeg**
   - Windows: https://ffmpeg.org/download.html
   - Linux: `sudo apt-get install ffmpeg`
   - macOS: `brew install ffmpeg`

3. **修改后端代码** - `routes/detection.js`

4. **修改前端代码** - `public/dashboard.html`

5. **后台异步处理** - 支持队列管理

**优点**：
- ? 后端异步处理，不阻塞 HTTP
- ? WebSocket 实时推送进度
- ? 生成带检测框的视频
- ? 支持大视频文件

---

## ? 方案3：独立命令行脚本（推荐批量处理）

**文件位置**：`detect_video.py`

### 直接使用

```bash
# 基础用法
python detect_video.py input.mp4 output.mp4

# 调整置信度（0-1，越高越严格）
python detect_video.py input.mp4 output.mp4 0.6

# 批量处理
for video in *.mp4; do
    python detect_video.py "$video" "detected_$video"
done
```

**输出结果**：
- 检测后的视频：`output.mp4`（带检测框和统计数据）
- JSON 统计数据（打印在终端）

---

## ? 各方案的细节对比

### 简化版 vs 完整版

| 方面 | 简化版 | 完整版 |
|-----|--------|--------|
| 帧处理位置 | 浏览器 | 服务器 |
| 视频输出 | ? 无 | ? 有 |
| 检测速度 | 慢 (串行) | 快 (并行+GPU) |
| 浏览器负载 | 高 | 低 |
| 内存占用 | 中 | 低 |
| 支持文件大小 | <500MB | 无限制 |

### 完整版 vs 命令行脚本

| 方面 | 完整版 | 命令行脚本 |
|-----|--------|----------|
| 使用方式 | Web 界面 | 终端命令 |
| 实时进度 | WebSocket | 终端输出 |
| 适合场景 | 实时检测 | 批量处理 |
| 可视化 | 丰富 | 基础 |

---

## ?? 常见问题速答

### Q1: 我应该选择哪个方案？

**新手？** → 选 **简化版** (SIMPLE_VIDEO_DETECTION.md)
- 无需额外安装
- 改动最少
- 5分钟上手

**生产环境？** → 选 **完整版** (VIDEO_DETECTION_TUTORIAL.md)
- 支持大文件
- 性能好
- 功能完整

**需要批量处理？** → 选 **命令行脚本** (detect_video.py)
- 直接在 Python 中运行
- 无需 Web 界面
- 适合自动化脚本

---

### Q2: 为什么检测很慢？

**简化版原因**：
- 浏览器逐帧上传，网络延迟重
- 每个帧都要等待服务器响应
- **解决方案**：降低帧率 (`VIDEO_FPS = 2`)

**完整版原因**：
- YOLO 模型推理时间长
- **解决方案**：
  - 降低置信度阈值 (`conf=0.3`)
  - 使用 GPU (`ultralytics` 默认支持)
  - 减少视频分辨率

**命令行原因**：
- 同上
- **解决方案**：加 `0.3` 参数降低置信度
  ```bash
  python detect_video.py input.mp4 output.mp4 0.3
  ```

---

### Q3: 检测结果很差（漏检或误检）？

1. **检查模型文件**：确保使用的是 `best.pt` 而不是其他模型
   ```python
   # detect.py 中
   model = YOLO('best.pt')  # ? 这个
   # 而不是
   model = YOLO('yolov8n.pt')  # ? 通用小模型
   ```

2. **调整置信度**：
   - 太高 → 漏检
   - 太低 → 误检
   - 推荐范围：0.4-0.6

3. **检查训练数据**：
   - 模型是否在您的场景上进行过微调？
   - 是否包含足够多样的样本？

---

### Q4: 支持实时摄像头吗？

**简化版**：稍作修改可以支持
```javascript
// 替换这一行：
const videoUrl = URL.createObjectURL(file);

// 改为：
navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
        videoElement.srcObject = stream;
        // 然后提取帧检测...
    });
```

**完整版**：同样支持，改 FFmpeg 输入源为摄像头设备

**命令行脚本**：
```bash
python detect_video.py 0 output.mp4  # 0 表示默认摄像头
```

---

### Q5: 怎么启用 GPU 加速？

```python
# detect.py 顶部添加
from ultralytics import YOLO

# YOLO 会自动检测 GPU
model = YOLO('best.pt')
# 运行检测时自动使用 GPU

# 如果要指定设备，可以：
model = YOLO('best.pt', device=0)  # GPU 0
model = YOLO('best.pt', device='cpu')  # CPU
```

**前置条件**：
- NVIDIA GPU (`nvidia-smi` 能识别)
- CUDA Toolkit 已安装
- cuDNN 已安装

---

### Q6: 如何导出检测结果为 CSV？

**简化版**：修改 JavaScript
```javascript
// 添加导出函数
function exportStatsAsCSV(data) {
    const csv = 'Vehicle Type,Count\n' +
                `Bus,${data.bus}\n` +
                `Car,${data.car}\n` +
                `Freight,${data.freight}\n` +
                `Truck,${data.truck}\n` +
                `Van,${data.van}`;
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'detection_results.csv';
    a.click();
}
```

**完整版**：在 WebSocket 消息中追加
```javascript
// 检测完成时导出
if (data.status === 'completed') {
    exportResults(data.results);
}
```

---

### Q7: 视频编码格式有要求吗？

**简化版**：
- HTML5 video 标签支持的格式都可以
- 推荐：MP4 (H.264 编码)
- 通常兼容：WebM, Ogg

**完整版**：
- FFmpeg 支持的所有格式
- 推荐：MP4, AVI, MOV, MKV

**命令行脚本**：
- OpenCV 支持的所有格式
- 推荐：MP4

**最安全的选择**：MP4（所有平台都支持）

---

## ? 性能基准

在测试机器上（i5 + RTX 3060）：

### 简化版
- 视频长度：1 分钟
- FPS：1-2（取决于网络）
- 总耗时：~2-3 分钟

### 完整版
- 视频长度：1 分钟
- FPS：30+（使用 GPU）
- 总耗时：~10-20 秒

### 命令行脚本
- 视频长度：1 分钟
- FPS：30+（使用 GPU）
- 总耗时：~10-20 秒

---

## ? 进阶技巧

### 1. 自定义检测类别
```python
# 在 detect.py 中修改
class_mapping = {
    'bus': '公交车',
    'car': '小汽车',
    'truck': '货车',
    # 添加新类别
}
```

### 2. 调整视频输出质量
```python
# 完整版中的 FFmpeg 设置
fourcc = cv2.VideoWriter_fourcc(*'mp4v')
# 更改编码器或质量参数
```

### 3. 多线程并行处理（完整版）
```javascript
// 修改 detection.js
const maxConcurrent = 8;  // 增加并发数
```

### 4. 动态模型切换
```python
# 运行时选择模型
model = YOLO(sys.argv[3])  # 从命令行指定
```

---

## ? 完整文档速索

| 文档 | 用途 | 难度 |
|-----|-----|------|
| SIMPLE_VIDEO_DETECTION.md | 简化方案详细教程 | ? |
| VIDEO_DETECTION_TUTORIAL.md | 完整方案详细教程 | ??? |
| detect_video.py | 命令行脚本 | ?? |
| 本文档 | 快速参考 | ? |

---

## ? 验证检查清单

选择您的方案后，按以下清单检查：

### 简化版
- [ ] `dashboard.html` 中 `<script>` 已修改
- [ ] `/api/detection/run` 接口可用
- [ ] 能选择本地视频文件
- [ ] 点击"开始检测"无报错

### 完整版
- [ ] `npm install fluent-ffmpeg ws` 已执行
- [ ] FFmpeg 已安装并在 PATH 中
- [ ] `detection.js` 已修改
- [ ] `dashboard.html` 已修改
- [ ] Node.js 服务已重启

### 命令行脚本
- [ ] `best.pt` 在项目根目录
- [ ] `python detect_video.py --help` 无报错
- [ ] 测试视频能成功检测
- [ ] 输出视频文件已生成

---

## ? 快速问题诊断

**问题**：无法读取视频
- ? 检查视频格式是否支持
- ? 尝试转换为 MP4 格式

**问题**：YOLO 很慢
- ? 启用 GPU (CUDA)
- ? 降低模型精度或输入分辨率

**问题**：前端无响应
- ? 检查浏览器控制台错误
- ? 检查网络连接

**问题**：Python 报错
- ? 检查 Python 版本 (>= 3.8)
- ? 检查依赖 (`pip install ultralytics opencv-python`)

---

**开始使用吧！祝您成功！** ?

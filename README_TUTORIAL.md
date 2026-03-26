# ? 视频检测完整教程索引

欢迎使用OmniAero无人机平台的视频检测功能！本项目提供了**多个方案**，适应不同的需求。

---

## ? 快速导航（5秒选择您的方案）

### 问题1：我有多少时间？

- ?? **5分钟**：选择 **[简化版](./SIMPLE_VIDEO_DETECTION.md)**
- ?? **30分钟**：选择 **[完整版](./VIDEO_DETECTION_TUTORIAL.md)**  
- ?? **立即**：选择 **[命令行脚本](./detect_video.py)**

### 问题2：我的使用场景是？

| 场景 | 推荐方案 | 链接 |
|-----|---------|------|
| 快速原型/演示 | 简化版 | [SIMPLE_VIDEO_DETECTION.md](./SIMPLE_VIDEO_DETECTION.md) |
| 生产环境/高性能 | 完整版 | [VIDEO_DETECTION_TUTORIAL.md](./VIDEO_DETECTION_TUTORIAL.md) |
| 批量视频处理/自动化 | 命令行脚本 | [detect_video.py](./detect_video.py) |
| 我不确定 | 快速参考 | [QUICK_START.md](./QUICK_START.md) |

---

## ? 文档清单

### 核心教程（按推荐顺序）

#### 1?? **快速参考指南** ?????
**文件**：[QUICK_START.md](./QUICK_START.md)  
**耗时**：5-10分钟  
**内容**：
- 3种方案对比表
- 快速上手步骤
- 常见问题解答 (FAQ)
- 性能基准数据
- 故障排查清单

**适合**：所有用户，特别是不确定选择的用户

---

#### 2?? **简化版方案** ??（推荐新手）
**文件**：[SIMPLE_VIDEO_DETECTION.md](./SIMPLE_VIDEO_DETECTION.md)  
**耗时**：20-30分钟  
**内容**：
- 前端修改代码（复制粘贴即可）
- 逐帧检测原理说明
- 性能调优参数
- 已知限制说明

**适合**：
- 快速原型开发
- 学习视频检测基础
- 浏览器端处理

**优点**：? 无需额外依赖 | ? 代码少 | ? 易于理解

---

#### 3?? **完整版方案** ???（推荐生产环境）
**文件**：[VIDEO_DETECTION_TUTORIAL.md](./VIDEO_DETECTION_TUTORIAL.md)  
**耗时**：1-2小时  
**内容**：
- 完整架构说明（附流程图）
- 后端 Node.js 实现细节
- Python 脚本优化方案
- WebSocket 实时通信
- 故障排查指南
- 性能优化建议
- 扩展功能思路

**适合**：
- 生产环境部署
- 大视频文件处理
- 高实时性要求
- 需要结果视频输出

**优点**：? 高性能 | ? 完整功能 | ? 可扩展

---

#### 4?? **命令行脚本** ??（推荐自动化）
**文件**：[detect_video.py](./detect_video.py)  
**耗时**：直接使用（无需编写代码）  
**内容**：
- 完整的视频处理脚本
- 命令行参数说明
- 统计数据计算
- 结果视频生成

**用途**：
```bash
# 基础用法
python detect_video.py input.mp4 output.mp4

# 批量处理
for video in *.mp4; do
    python detect_video.py "$video" "detected_$video"
done
```

**适合**：
- 批量视频处理
- 自动化脚本集成
- 数据预处理
- 后端任务队列集成

**优点**：? 独立脚本 | ? 立即可用 | ? 易于集成

---

## ? 架构对比

### 简化版架构
```
浏览器 HTML5 Canvas
    ↓ 逐帧提取
HTTP POST (每帧)
    ↓
Node.js /api/detection/run
    ↓
Python detect.py (单帧检测)
    ↓
返回检测结果 JSON
    ↓
浏览器累加统计
```

### 完整版架构
```
浏览器 上传视频
    ↓
Node.js /api/detection/run-video
    ↓
FFmpeg 提取所有帧
    ↓
Python 逐帧/并行检测
    ↓
WebSocket 推送进度
    ↓
生成结果视频
    ↓
浏览器显示进度和统计
```

### 命令行脚本架构
```
终端命令
    ↓
Python detect_video.py
    ↓
OpenCV 逐帧检测
    ↓
保存结果视频
    ↓
打印统计数据
```

---

## ?? 实施步骤总结

### 选择简化版？
```
1. 打开 SIMPLE_VIDEO_DETECTION.md
2. 复制前端 HTML 代码到 dashboard.html
3. 复制 JavaScript 代码到 <script> 部分
4. 刷新浏览器，上传视频即可
```

### 选择完整版？
```
1. 运行 npm install fluent-ffmpeg ws
2. 安装 FFmpeg（系统工具）
3. 打开 VIDEO_DETECTION_TUTORIAL.md
4. 按步骤修改 routes/detection.js
5. 按步骤修改 public/dashboard.html
6. 重启 Node.js 服务器
7. 打开浏览器，上传视频即可
```

### 使用命令行脚本？
```
1. 确保 best.pt 在项目根目录
2. 运行 python detect_video.py input.mp4 output.mp4
3. 等待完成，查看输出视频
```

---

## ? 学习路径建议

### ? 初级（刚接触视频检测）
1. 读 [QUICK_START.md](./QUICK_START.md) - 了解全貌（10分钟）
2. 实施 [简化版](./SIMPLE_VIDEO_DETECTION.md) - 快速上手（30分钟）
3. 尝试修改参数 - 理解工作原理（30分钟）

**预期时间**：1-2小时 | **输出**：能上传和检测视频

### ? 中级（准备上线）
1. 完成初级学习路径
2. 读 [完整版](./VIDEO_DETECTION_TUTORIAL.md) 前4章 - 理解架构（1小时）
3. 实施 [完整版方案](./VIDEO_DETECTION_TUTORIAL.md) - 搭建完整系统（2-3小时）
4. 本地测试、性能调优（1小时）

**预期时间**：4-6小时 | **输出**：生产就绪的检测系统

### ? 高级（大规模部署）
1. 完成中级学习路径
2. 读 [完整版](./VIDEO_DETECTION_TUTORIAL.md) 性能优化章节
3. 集成 [命令行脚本](./detect_video.py) 到后端队列
4. 实施多GPU并行处理、分布式处理等

**预期时间**：10+ 小时 | **输出**：企业级检测平台

---

## ? 方案选择决策树

```
您想要...
│
├─ 快速演示?
│  └─ 是 → 简化版 (SIMPLE_VIDEO_DETECTION.md)
│  └─ 否 →
│
├─ 生成带检测框的视频?
│  └─ 是 → 完整版 (VIDEO_DETECTION_TUTORIAL.md)
│  └─ 否 →
│
├─ 处理大视频文件?
│  └─ 是 → 完整版 (VIDEO_DETECTION_TUTORIAL.md)
│  └─ 否 →
│
├─ 需要实时Web界面?
│  └─ 是 → 完整版 (VIDEO_DETECTION_TUTORIAL.md)
│  └─ 否 →
│
└─ 批量处理视频?
   └─ 是 → 命令行脚本 (detect_video.py)
   └─ 否 → 简化版 (SIMPLE_VIDEO_DETECTION.md)
```

---

## ?? 常见任务速查表

| 任务 | 方案 | 文档位置 |
|-----|------|--------|
| 添加视频上传界面 | 简化版/完整版 | [SIMPLE_VIDEO_DETECTION.md](./SIMPLE_VIDEO_DETECTION.md#步骤1修改前端-dashboardhtml) |
| 实现逐帧检测 | 简化版 | [SIMPLE_VIDEO_DETECTION.md](./SIMPLE_VIDEO_DETECTION.md#逐帧检测函数) |
| 后端异步处理视频 | 完整版 | [VIDEO_DETECTION_TUTORIAL.md](./VIDEO_DETECTION_TUTORIAL.md#第一步修改后端-api-支持视频的检测接口) |
| WebSocket 实时推送 | 完整版 | [VIDEO_DETECTION_TUTORIAL.md](./VIDEO_DETECTION_TUTORIAL.md#websocket-广播函数) |
| 命令行批量处理 | 脚本 | [detect_video.py](./detect_video.py) |
| 调整检测灵敏度 | 全部 | [QUICK_START.md](./QUICK_START.md#q2-为什么检测很慢) |
| 启用GPU加速 | 全部 | [QUICK_START.md](./QUICK_START.md#q5-怎么启用-gpu-加速) |
| 性能基准对比 | 参考 | [QUICK_START.md](./QUICK_START.md#性能基准) |

---

## ? 获取帮助

### 我的问题在这里吗？

| 问题类型 | 查看位置 |
|---------|--------|
| 我不确定选哪个方案 | [QUICK_START.md - 方案对比](./QUICK_START.md#方案对比) |
| 为什么很慢 | [QUICK_START.md - Q2](./QUICK_START.md#q2-为什么检测很慢) |
| 检测结果很差 | [QUICK_START.md - Q3](./QUICK_START.md#q3-检测结果很差漏检或误检) |
| Python 报错 | [QUICK_START.md - 快速问题诊断](./QUICK_START.md#快速问题诊断) |
| 支持摄像头吗 | [QUICK_START.md - Q4](./QUICK_START.md#q4-支持实时摄像头吗) |
| 无法读取视频 | [QUICK_START.md - 快速问题诊断](./QUICK_START.md#快速问题诊断) |
| WebSocket 连接失败 | [VIDEO_DETECTION_TUTORIAL.md - 故障排查](./VIDEO_DETECTION_TUTORIAL.md#故障排查) |
| FFmpeg 找不到 | [VIDEO_DETECTION_TUTORIAL.md - 配置FFmpeg](./VIDEO_DETECTION_TUTORIAL.md#第六步配置-ffmpeg) |

---

## ? 开始使用

### 第一次来？
1. ? 阅读 [QUICK_START.md](./QUICK_START.md) (5-10分钟)
2. ? 选择适合您的方案
3. ? 打开对应的教程文档
4. ?? 按步骤实施
5. ? 完成！

### 有经验的开发者？
1. ? 扫一眼 [方案对比表](./QUICK_START.md#方案对比)
2. ? 直接选择方案
3. ? 打开对应文档
4. ? 快速实施

### 需要批量处理？
1. ? 查看 [detect_video.py](./detect_video.py)
2. ? 配置命令行参数
3. ? 开始处理

---

## ? 文件清单

```
项目根目录
├── dashboard.html          ← 前端界面（需修改）
├── routes/detection.js     ← 后端 API（可能需修改）
├── detect.py              ← 单帧检测（可能需修改）
├── best.pt                ← YOLO 模型（保持不变）
│
├── QUICK_START.md         ← ? 从这里开始！
├── SIMPLE_VIDEO_DETECTION.md   ← 简化方案（推荐新手）
├── VIDEO_DETECTION_TUTORIAL.md ← 完整方案（推荐生产环境）
├── detect_video.py        ← 命令行脚本（推荐自动化）
└── README.md              ← 本文档（您正在读这个！）
```

---

## ? 最佳实践建议

1. **先用简化版试验** - 理解工作流程
2. **为生产环境升级到完整版** - 获得更好性能
3. **建立测试集** - 用几个代表性视频测试模型
4. **监测性能指标** - 记录处理速度和准确率
5. **定期优化参数** - 根据实际数据调整置信度等参数

---

## ? 联系方式

- 问题反馈：查看对应文档的**故障排查**章节
- 性能优化：参考 [QUICK_START.md - 进阶技巧](./QUICK_START.md#进阶技巧)
- 功能扩展：查看 [VIDEO_DETECTION_TUTORIAL.md - 扩展功能](./VIDEO_DETECTION_TUTORIAL.md#扩展功能)

---

**祝您使用愉快！** ?

*最后更新：2026年3月20日*

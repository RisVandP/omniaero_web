const express = require('express');
const router = express.Router();
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// 1. 配置 multer：负责接收前端传来的图片，并临时存放在 public/uploads/
// 1. 配置 multer：使用 diskStorage 引擎以保留文件后缀名
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../public/uploads/'));
    },
    filename: function (req, file, cb) {
        // 提取原始文件的后缀名 (例如 .jpg, .png)
        const ext = path.extname(file.originalname);
        // 生成一个包含时间戳和原始后缀名的新文件名
        cb(null, 'input_' + Date.now() + ext);
    }
});
const upload = multer({ storage: storage });

// 2. 核心检测接口
router.post('/run', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: "未接收到图片" });

    const inputPath = req.file.path;
    const outputFilename = 'result_' + req.file.filename + '.jpg';
    const outputPath = path.join(__dirname, '../public/uploads/', outputFilename);

    // ⚠️ 极其重要：这里请务必改回你刚才查出来的 Conda Python 的绝对路径
    // 例如: 'D:\\Anaconda3\\envs\\yolo_env\\python.exe'
    const pythonExecutable = 'F:\\anaconda1\\envs\\yolo\\python.exe'; 
    const pythonProcess = spawn(pythonExecutable, ['detect.py', inputPath, outputPath]);

    let pythonLogs = ""; // 收集所有的 Python 输出

    pythonProcess.stdout.on('data', (data) => {
        pythonLogs += data.toString();
        // 在控制台打印 Python 的输出，方便你在 VS Code 里看进度
        console.log("Python 输出:", data.toString().trim()); 
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`Python 错误: ${data}`);
    });
// 等待 Python 进程彻底运行完毕再返回给前端
    pythonProcess.on('close', (code) => {
        if (code === 0 && pythonLogs.includes("SUCCESS_JSON:")) {
            // 提取 JSON 字符串
            const jsonStr = pythonLogs.split("SUCCESS_JSON:")[1].trim();
            let realCounts = { bus: 0, car: 0, freight: 0, truck: 0, van: 0 };
            try { 
                realCounts = JSON.parse(jsonStr); 
            } catch(e) { console.error("解析Python输出的JSON失败"); }

            res.json({ 
                code: 200, 
                message: "检测成功", 
                data: { 
                    resultImageUrl: `/uploads/${outputFilename}`,
                    counts: realCounts // 关键：把真实的统计数据返回给前端！
                } 
            });
        } else {
            res.status(500).json({ message: "模型推理失败", log: pythonLogs });
        }
        
        fs.unlink(inputPath, (err) => { if(err) console.error("清理原图失败", err); });
    });
});

module.exports = router;
# -*- coding: utf-8 -*-
import sys
import io
import json
from ultralytics import YOLO

# 强制将 Python 的控制台输出设为 UTF-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf8')

def run_detection(input_path, output_path):
    try:
        # 注意：这里请使用你们自己的 best.pt，如果没有就先用 yolov8n.pt 或 yolov8n-obb.pt
        model = YOLO('best.pt') 
        
        # 执行推理，关闭多余日志
        results = model(input_path, verbose=False)
        results[0].save(filename=output_path)
        
        # 1. 初始化前端需要的 5 个类别的计数器
        counts = {"bus": 0, "car": 0, "freight": 0, "truck": 0, "van": 0}
        
        # 2. 遍历所有检测到的框，统计数量
        names = model.names
        for box in results[0].boxes:
            cls_name = names[int(box.cls)].lower()
            
            # 简单的分类映射（防止模型出来的名字跟前端对不上）
            if "bus" in cls_name: counts["bus"] += 1
            elif "freight" in cls_name: counts["freight"] += 1
            elif "truck" in cls_name: counts["truck"] += 1
            elif "van" in cls_name: counts["van"] += 1
            else: counts["car"] += 1 # 默认其他车都算作小汽车
            
        # 3. 将带有数据的 JSON 拼接到 SUCCESS 后面打印出来
        print("SUCCESS_JSON:" + json.dumps(counts))
        
    except Exception as e:
        print(f"ERROR: {str(e)}")

if __name__ == '__main__':
    run_detection(sys.argv[1], sys.argv[2])
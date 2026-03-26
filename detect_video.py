#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
视频 YOLO 检测脚本 - detect_video.py
用于处理视频文件并进行实时逐帧 YOLO 检测

使用方法：
    python detect_video.py input.mp4 output.mp4
"""

import sys
import cv2
import json
from pathlib import Path
from ultralytics import YOLO

class VideoDetector:
    """视频检测器"""
    
    def __init__(self, model_path='best.pt'):
        """初始化检测器"""
        self.model = YOLO(model_path)
        self.class_names = {
            'bus': '公交车',
            'car': '小汽车',
            'freight': '货车',
            'truck': '大货车',
            'van': '面包车'
        }
    
    def detect_video(self, input_path, output_path, conf=0.5, show_progress=True):
        """
        检测视频文件
        
        :param input_path: 输入视频路径
        :param output_path: 输出视频路径
        :param conf: 置信度阈值 (0-1)
        :param show_progress: 是否显示进度
        :return: 检测统计结果
        """
        # 打开输入视频
        cap = cv2.VideoCapture(input_path)
        
        if not cap.isOpened():
            raise ValueError(f"无法打开视频文件: {input_path}")
        
        # 获取视频信息
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        print(f"? 视频信息:")
        print(f"   分辨率: {width}x{height}")
        print(f"   帧率: {fps} fps")
        print(f"   总帧数: {total_frames}")
        print(f"   时长: {total_frames/fps:.1f}s")
        
        # 初始化视频输出
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
        
        # 初始化统计计数器
        stats = {
            'bus': 0,
            'car': 0,
            'freight': 0,
            'truck': 0,
            'van': 0,
            'total_objects': 0
        }
        
        frame_idx = 0
        print(f"\n? 开始检测...")
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            # 运行 YOLO 检测
            results = self.model(frame, conf=conf, verbose=False)
            
            # 获取检测结果
            detections = results[0]
            
            # 统计检测对象
            for box in detections.boxes:
                class_id = int(box.cls)
                class_name = self.model.names[class_id].lower()
                confidence = float(box.conf)
                
                # 分类统计
                if 'bus' in class_name:
                    stats['bus'] += 1
                elif 'freight' in class_name:
                    stats['freight'] += 1
                elif 'truck' in class_name:
                    stats['truck'] += 1
                elif 'van' in class_name:
                    stats['van'] += 1
                else:
                    stats['car'] += 1
                
                stats['total_objects'] += 1
            
            # 绘制检测框和标签
            annotated_frame = detections.plot()
            
            # 在画面上显示统计信息
            self._draw_stats_on_frame(annotated_frame, stats)
            
            # 写入输出视频
            out.write(annotated_frame)
            
            frame_idx += 1
            
            # 显示进度
            if show_progress and frame_idx % 30 == 0:
                progress = (frame_idx / total_frames) * 100
                elapsed = frame_idx / fps
                print(f"   进度: {progress:.1f}% ({frame_idx}/{total_frames}) - 耗时: {elapsed:.1f}s")
        
        # 释放资源
        cap.release()
        out.release()
        
        # 添加最终统计
        stats['duration'] = total_frames / fps
        stats['frames_processed'] = frame_idx
        
        print(f"\n? 检测完成！")
        print(f"? 检测统计:")
        print(f"   公交车: {stats['bus']}")
        print(f"   小汽车: {stats['car']}")
        print(f"   货车: {stats['freight']}")
        print(f"   大货车: {stats['truck']}")
        print(f"   面包车: {stats['van']}")
        print(f"   总计: {stats['total_objects']}")
        print(f"   输出文件: {output_path}")
        
        return stats
    
    def _draw_stats_on_frame(self, frame, stats):
        """在视频帧上绘制统计信息"""
        h, w = frame.shape[:2]
        
        # 绘制背景矩形
        cv2.rectangle(frame, (10, 10), (300, 150), (255, 255, 255), -1)
        cv2.rectangle(frame, (10, 10), (300, 150), (0, 0, 0), 2)
        
        # 绘制文本
        y_offset = 35
        cv2.putText(frame, f"Bus: {stats['bus']}", (20, y_offset),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
        cv2.putText(frame, f"Car: {stats['car']}", (20, y_offset + 30),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
        cv2.putText(frame, f"Total: {stats['total_objects']}", (20, y_offset + 60),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
        cv2.putText(frame, f"Freight: {stats['freight']}", (160, y_offset),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
        cv2.putText(frame, f"Van: {stats['van']}", (160, y_offset + 30),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)


def main():
    """主函数"""
    if len(sys.argv) < 3:
        print("使用方法: python detect_video.py <input_video> <output_video> [confidence]")
        print("示例:")
        print("  python detect_video.py input.mp4 output.mp4")
        print("  python detect_video.py input.mp4 output.mp4 0.6")
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    conf = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5
    
    # 检查输入文件是否存在
    if not Path(input_path).exists():
        print(f"? 错误: 输入文件不存在 - {input_path}")
        sys.exit(1)
    
    try:
        # 创建检测器并处理视频
        detector = VideoDetector('best.pt')
        stats = detector.detect_video(input_path, output_path, conf=conf)
        
        # 输出 JSON 格式的结果（用于与 Node.js 集成）
        print(f"\nSUCCESS_JSON:" + json.dumps(stats))
        
    except Exception as e:
        print(f"? 错误: {str(e)}")
        sys.exit(1)


if __name__ == '__main__':
    main()

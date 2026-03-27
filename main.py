import base64
import os
from io import BytesIO

import cv2
import numpy as np
import onnxruntime as ort
from fastapi import FastAPI
from pydantic import BaseModel
from PIL import Image

app = FastAPI()

MODEL_PATH = "models/animeganv3.onnx"


class CartoonizeReq(BaseModel):
    imageBase64: str
    style: str = "cartoon"


class CartoonizeResp(BaseModel):
    imageBase64: str
    category: str
    categoryLabel: str
    categoryScore: float


class PoseReq(BaseModel):
    imageBase64: str


class PoseResp(BaseModel):
    # 所有坐标均为归一化值 [0,1]，相对于原图宽高
    # MediaPipe Pose 关键点索引:
    # 11=左肩 12=右肩 23=左髋 24=右髋 25=左膝 26=右膝
    leftShoulder: list   # [x, y]
    rightShoulder: list
    leftHip: list
    rightHip: list
    leftKnee: list
    rightKnee: list
    imageWidth: int
    imageHeight: int


def get_session():
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"模型文件不存在: {MODEL_PATH}")
    return ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])


session = get_session()
input_name = session.get_inputs()[0].name


CATEGORY_LABELS = {
    "top": "上衣",
    "pants": "裤子",
    "unknown": "未分类"
}


def remove_background(pil_img: Image.Image) -> Image.Image:
    """
    用 GrabCut + 边缘泛洪双策略抠图。
    对浅色服装（白/米/浅灰）也能保留完整前景。
    """
    img_rgb = np.array(pil_img.convert("RGB"))
    img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
    h, w = img_rgb.shape[:2]

    # ── 1. GrabCut：以图像边框向内 10px 为矩形初始化 ──
    margin = max(2, min(10, h // 20, w // 20))
    rect = (margin, margin, w - margin * 2, h - margin * 2)
    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)
    gc_mask = np.zeros((h, w), np.uint8)
    try:
        cv2.grabCut(img_bgr, gc_mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)
        grabcut_fg = np.where((gc_mask == cv2.GC_FGD) | (gc_mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    except Exception:
        grabcut_fg = np.ones((h, w), np.uint8) * 255

    # ── 2. 边缘泛洪：从四角泛洪识别纯色背景 ──
    img_hsv = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2HSV)
    S = img_hsv[:, :, 1]
    V = img_hsv[:, :, 2]
    bg_mask = ((V > 200) & (S < 60)).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    bg_mask = cv2.morphologyEx(bg_mask, cv2.MORPH_CLOSE, kernel, iterations=2)

    flood_mask = np.zeros((h + 2, w + 2), np.uint8)
    bg_flood = bg_mask.copy()
    for r, c in [(0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)]:
        if bg_mask[r, c] == 255:
            cv2.floodFill(bg_flood, flood_mask, (c, r), 128)
    edge_bg = (bg_flood == 128).astype(np.uint8) * 255
    flood_fg = cv2.bitwise_not(edge_bg)

    # ── 3. 合并：两种方法取并集（宁可保留多一点前景）──
    combined_fg = cv2.bitwise_or(grabcut_fg, flood_fg)

    # ── 4. 形态学后处理：填洞 + 去锯齿 ──
    kernel2 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    combined_fg = cv2.morphologyEx(combined_fg, cv2.MORPH_CLOSE, kernel2, iterations=3)
    combined_fg = cv2.morphologyEx(combined_fg, cv2.MORPH_ERODE,
                                   cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2)),
                                   iterations=1)

    # ── 5. 平滑 alpha 边缘 ──
    alpha = cv2.GaussianBlur(combined_fg, (5, 5), 0)

    r_ch, g_ch, b_ch = img_rgb[:, :, 0], img_rgb[:, :, 1], img_rgb[:, :, 2]
    rgba = np.dstack([r_ch, g_ch, b_ch, alpha])
    return Image.fromarray(rgba, "RGBA")


def to_multiple(x: int, is_tiny: bool = False) -> int:
    if is_tiny:
        return 256 if x < 256 else x - x % 16
    return 256 if x < 256 else x - x % 8


def preprocess_image(pil_img: Image.Image, model_name: str):
    img = np.array(pil_img.convert("RGB"))
    h, w = img.shape[:2]
    is_tiny = "tiny" in os.path.basename(model_name).lower()
    new_w = to_multiple(w, is_tiny)
    new_h = to_multiple(h, is_tiny)
    img = cv2.resize(img, (new_w, new_h))
    img = img.astype(np.float32) / 127.5 - 1.0
    img = np.expand_dims(img, axis=0)
    return img, (w, h)


def postprocess_image(output_tensor, original_size):
    out = np.squeeze(output_tensor)
    out = (out + 1.0) / 2.0 * 255.0
    out = np.clip(out, 0, 255).astype(np.uint8)
    out = cv2.resize(out, original_size)
    return Image.fromarray(out)


def classify_garment(pil_img: Image.Image):
    img = np.array(pil_img.convert("RGB"))
    fg_mask = np.any(img < 240, axis=2)
    if not np.any(fg_mask):
        return "unknown", 0.0
    ys, xs = np.where(fg_mask)
    y_min, y_max = int(np.min(ys)), int(np.max(ys))
    box_h = max(1, y_max - int(np.min(ys)) + 1)
    box_w = max(1, int(np.max(xs)) - int(np.min(xs)) + 1)
    aspect_ratio = box_h / box_w
    center_y = float(np.mean(ys)) / img.shape[0]
    pants_score = 0.0
    if aspect_ratio >= 1.35:
        pants_score += 0.45
    elif aspect_ratio >= 1.15:
        pants_score += 0.25
    if center_y >= 0.56:
        pants_score += 0.45
    elif center_y >= 0.50:
        pants_score += 0.25
    pants_score = min(0.95, pants_score)
    if pants_score >= 0.55:
        return "pants", float(round(pants_score, 2))
    top_score = max(0.55, min(0.95, 1.0 - pants_score))
    return "top", float(round(top_score, 2))


# ─── MediaPipe Pose ───────────────────────────────────
_mp_pose = None

def _get_mp_pose():
    global _mp_pose
    if _mp_pose is None:
        try:
            import mediapipe as mp
            _mp_pose = mp.solutions.pose.Pose(
                static_image_mode=True,
                model_complexity=1,
                enable_segmentation=False,
                min_detection_confidence=0.5
            )
        except ImportError:
            _mp_pose = False  # mediapipe 未安装，标记为不可用
    return _mp_pose if _mp_pose else None


def detect_pose(pil_img: Image.Image) -> dict:
    """
    用 MediaPipe 检测人体姿态关键点。
    返回各关键点的归一化坐标 [x, y]（0~1 相对于图像宽高）。
    若检测失败则返回默认值（按经验比例估算）。
    """
    img_rgb = np.array(pil_img.convert("RGB"))
    h, w = img_rgb.shape[:2]

    # MediaPipe 关键点索引
    LEFT_SHOULDER  = 11
    RIGHT_SHOULDER = 12
    LEFT_HIP       = 23
    RIGHT_HIP      = 24
    LEFT_KNEE      = 25
    RIGHT_KNEE     = 26

    try:
        pose = _get_mp_pose()
        results = pose.process(img_rgb)
        if results.pose_landmarks:
            lm = results.pose_landmarks.landmark
            def pt(idx):
                return [round(lm[idx].x, 4), round(lm[idx].y, 4)]
            return {
                "leftShoulder":  pt(LEFT_SHOULDER),
                "rightShoulder": pt(RIGHT_SHOULDER),
                "leftHip":       pt(LEFT_HIP),
                "rightHip":      pt(RIGHT_HIP),
                "leftKnee":      pt(LEFT_KNEE),
                "rightKnee":     pt(RIGHT_KNEE),
                "imageWidth":    w,
                "imageHeight":   h
            }
    except Exception as e:
        print(f"MediaPipe 检测失败，使用默认值: {e}")

    # 降级默认值（全身正面站立模特的经验比例）
    return {
        "leftShoulder":  [0.38, 0.22],
        "rightShoulder": [0.62, 0.22],
        "leftHip":       [0.40, 0.52],
        "rightHip":      [0.60, 0.52],
        "leftKnee":      [0.41, 0.73],
        "rightKnee":     [0.59, 0.73],
        "imageWidth":    w,
        "imageHeight":   h
    }


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_PATH}


@app.post("/pose", response_model=PoseResp)
def pose(req: PoseReq):
    """检测模特图的人体关键点，供前端计算服装叠加位置。"""
    try:
        img_bytes = base64.b64decode(req.imageBase64)
        pil_img = Image.open(BytesIO(img_bytes)).convert("RGB")
        result = detect_pose(pil_img)
        return PoseResp(**result)
    except Exception as e:
        raise RuntimeError(f"pose detection failed: {str(e)}")


@app.post("/cartoonize", response_model=CartoonizeResp)
def cartoonize(req: CartoonizeReq):
    try:
        img_bytes = base64.b64decode(req.imageBase64)
        pil_img = Image.open(BytesIO(img_bytes)).convert("RGB")

        category, score = classify_garment(pil_img)
        category_label = CATEGORY_LABELS.get(category, CATEGORY_LABELS["unknown"])

        input_tensor, original_size = preprocess_image(pil_img, MODEL_PATH)
        outputs = session.run(None, {input_name: input_tensor})
        cartoon_rgb = postprocess_image(outputs[0], original_size)

        cartoon_rgba = remove_background(cartoon_rgb)

        out_buf = BytesIO()
        cartoon_rgba.save(out_buf, format="PNG")
        out_b64 = base64.b64encode(out_buf.getvalue()).decode("utf-8")

        return CartoonizeResp(
            imageBase64=out_b64,
            category=category,
            categoryLabel=category_label,
            categoryScore=score
        )
    except Exception as e:
        raise RuntimeError(f"cartoonize failed: {str(e)}")

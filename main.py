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
    waistOffset: float = 0.0
    waistOffsetX: float = 0.0


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
    针对白底/浅色背景商品图的自动抠图。
    返回带透明通道（RGBA）的 PIL Image。
    """
    img_rgb = np.array(pil_img.convert("RGB"))
    h, w = img_rgb.shape[:2]

    # ── 1. Lab 亮度 + HSV 双通道背景检测 ──
    img_lab = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2LAB)
    L = img_lab[:, :, 0]
    img_hsv = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2HSV)
    S = img_hsv[:, :, 1]
    V = img_hsv[:, :, 2]

    # 背景：高亮度 + 低饱和（白/灰色区域）
    bg_mask = ((V > 220) & (S < 40)).astype(np.uint8) * 255

    # ── 2. 形态学处理：CLOSE + DILATE ──
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    bg_mask = cv2.morphologyEx(bg_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    bg_mask = cv2.morphologyEx(bg_mask, cv2.MORPH_DILATE, kernel, iterations=1)

    # ── 3. 边缘连通域泛洪填充 ──
    flood_mask = np.zeros((h + 2, w + 2), np.uint8)
    bg_flood = bg_mask.copy()
    corners = [(0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)]
    for r, c in corners:
        if bg_mask[r, c] == 255:
            cv2.floodFill(bg_flood, flood_mask, (c, r), 128)
    edge_bg = (bg_flood == 128).astype(np.uint8) * 255

    # ── 4. 前景 mask ──
    fg_mask = cv2.bitwise_not(edge_bg)

    # ── 5. 检测是否为深色服装，动态调整腐蚀强度 ──
    # 取前景区域的平均明度，判断是深色还是浅色服装
    fg_pixels_V = V[fg_mask > 128]
    is_dark = len(fg_pixels_V) > 0 and float(np.mean(fg_pixels_V)) < 130

    if is_dark:
        # 深色服装：更激进的腐蚀，去掉白色背景边缘残留
        erode_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_ERODE, erode_kernel, iterations=3)
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_DILATE, erode_kernel, iterations=2)
    else:
        # 浅色服装：轻微腐蚀即可
        erode_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_ERODE, erode_kernel, iterations=1)

    # ── 6. 高斯模糊 alpha 边缘 ──
    alpha = cv2.GaussianBlur(fg_mask, (5, 5), 0)

    # ── 7. 合成 RGBA ──
    r_ch, g_ch, b_ch = img_rgb[:, :, 0], img_rgb[:, :, 1], img_rgb[:, :, 2]
    rgba = np.dstack([r_ch, g_ch, b_ch, alpha])
    return Image.fromarray(rgba, "RGBA")

def detect_waist_offset(rgba_img: Image.Image) -> float:
    """
    检测前景顶部在整张图中的归一化位置（0~1）。
    返回值越大，表示前景顶部离图片顶端越远（上方空白越多）。
    """
    arr = np.array(rgba_img)  # RGBA
    alpha = arr[:, :, 3]

    # 只看中间区域，减少边角噪声干扰
    h, w = alpha.shape
    x1 = int(w * 0.15)
    x2 = int(w * 0.85)
    alpha_mid = alpha[:, x1:x2]

    rows = np.where(np.any(alpha_mid > 30, axis=1))[0]
    if len(rows) == 0:
        return 0.0

    top_row = int(rows[0])
    return round(top_row / h, 4)

def detect_waist_offset_x(rgba_img: Image.Image, top_row_ratio: float) -> float:
    """
    检测前景上边缘（裤腰附近）的水平中心相对图片中心的偏移。
    返回范围约 [-0.5, 0.5]，右偏为正，左偏为负。
    """
    arr = np.array(rgba_img)
    alpha = arr[:, :, 3]
    h, w = alpha.shape

    top_row = int(max(0, min(h - 1, round(top_row_ratio * h))))
    band_h = max(6, int(h * 0.08))
    y1 = top_row
    y2 = min(h, top_row + band_h)

    band = alpha[y1:y2, :]
    ys, xs = np.where(band > 30)
    if len(xs) == 0:
        return 0.0

    cx = float(np.mean(xs)) / w
    return round(cx - 0.5, 4)

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

        # 1. 分类（用原图分类更准确）
        category, score = classify_garment(pil_img)
        category_label = CATEGORY_LABELS.get(category, CATEGORY_LABELS["unknown"])

        # 2. 卡通化
        input_tensor, original_size = preprocess_image(pil_img, MODEL_PATH)
        outputs = session.run(None, {input_name: input_tensor})
        cartoon_rgb = postprocess_image(outputs[0], original_size)

        # 3. 对卡通化结果去背景（输出透明 PNG）
        cartoon_rgba = remove_background(cartoon_rgb)

        # 4. 动态检测裤腰偏移（仅裤子有意义）
        if category == "pants":
            waist_offset = detect_waist_offset(cartoon_rgba)
            waist_offset_x = detect_waist_offset_x(cartoon_rgba, waist_offset)
        else:
            waist_offset = 0.0
            waist_offset_x = 0.0

        # 5. 编码为 PNG base64（保留透明通道）
        out_buf = BytesIO()
        cartoon_rgba.save(out_buf, format="PNG")
        out_b64 = base64.b64encode(out_buf.getvalue()).decode("utf-8")

        return CartoonizeResp(
            imageBase64=out_b64,
            category=category,
            categoryLabel=category_label,
            categoryScore=score,
            waistOffset=waist_offset,
            waistOffsetX=waist_offset_x
        )
    except Exception as e:
        raise RuntimeError(f"cartoonize failed: {str(e)}")

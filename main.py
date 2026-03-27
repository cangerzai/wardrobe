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

    img_hsv = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2HSV)
    S = img_hsv[:, :, 1]
    V = img_hsv[:, :, 2]

    # 背景 mask：高亮度 + 低饱和（白/灰色区域）
    bg_mask = ((V > 220) & (S < 40)).astype(np.uint8) * 255

    # 形态学填补前景内部空洞
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    bg_mask = cv2.morphologyEx(bg_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    bg_mask = cv2.morphologyEx(bg_mask, cv2.MORPH_DILATE, kernel, iterations=1)

    # 只保留与图像边缘相连的背景（避免误删服装内部白色区域）
    flood_mask = np.zeros((h + 2, w + 2), np.uint8)
    bg_flood = bg_mask.copy()
    corners = [(0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)]
    for r, c in corners:
        if bg_mask[r, c] == 255:
            cv2.floodFill(bg_flood, flood_mask, (c, r), 128)
    edge_bg = (bg_flood == 128).astype(np.uint8) * 255

    fg_mask = cv2.bitwise_not(edge_bg)
    fg_mask = cv2.morphologyEx(
        fg_mask,
        cv2.MORPH_ERODE,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)),
        iterations=1
    )

    # 高斯模糊 alpha 边缘，让边缘更自然
    alpha = cv2.GaussianBlur(fg_mask, (5, 5), 0)

    r_ch = img_rgb[:, :, 0]
    g_ch = img_rgb[:, :, 1]
    b_ch = img_rgb[:, :, 2]
    rgba = np.dstack([r_ch, g_ch, b_ch, alpha])
    return Image.fromarray(rgba, "RGBA")


def remove_background(pil_img: Image.Image) -> Image.Image:
    """
    针对白底/浅色背景商品图的自动抠图。
    返回带透明通道（RGBA）的 PIL Image。
    """
    img_rgb = np.array(pil_img.convert("RGB"))
    h, w = img_rgb.shape[:2]

    # ── 1. 转 Lab 色彩空间，对白色背景更鲁棒 ──
    img_lab = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2LAB)
    L = img_lab[:, :, 0]  # 亮度通道

    # ── 2. 阈值：亮度 > 230 且饱和度低 视为背景 ──
    img_hsv = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2HSV)
    S = img_hsv[:, :, 1]   # 饱和度
    V = img_hsv[:, :, 2]   # 明度

    # 背景 mask：高亮度 + 低饱和（白/灰色区域）
    bg_mask = ((V > 220) & (S < 40)).astype(np.uint8) * 255

    # ── 3. 形态学处理，填补前景内部空洞 ──
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    bg_mask = cv2.morphologyEx(bg_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    bg_mask = cv2.morphologyEx(bg_mask, cv2.MORPH_DILATE, kernel, iterations=1)

    # ── 4. 连通域：只保留与图像边缘相连的背景区域 ──
    # 这样可以避免把服装内部的白色区域也当背景删掉
    flood_mask = np.zeros((h + 2, w + 2), np.uint8)
    bg_flood = bg_mask.copy()
    # 从四个角和四条边缘泛洪填充
    corners = [
        (0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)
    ]
    for r, c in corners:
        if bg_mask[r, c] == 255:
            cv2.floodFill(bg_flood, flood_mask, (c, r), 128)
    # 只取边缘连通的背景
    edge_bg = (bg_flood == 128).astype(np.uint8) * 255

    # ── 5. 前景 mask ──
    fg_mask = cv2.bitwise_not(edge_bg)

    # 轻微腐蚀去掉边缘锯齿
    fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_ERODE,
                               cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)),
                               iterations=1)

    # ── 6. 高斯模糊 alpha 边缘，让边缘更自然 ──
    alpha = cv2.GaussianBlur(fg_mask, (5, 5), 0)

    # ── 7. 合成 RGBA ──
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
    img = np.expand_dims(img, axis=0)  # NHWC
    return img, (w, h)


def postprocess_image(output_tensor, original_size):
    out = np.squeeze(output_tensor)
    out = (out + 1.0) / 2.0 * 255.0
    out = np.clip(out, 0, 255).astype(np.uint8)
    out = cv2.resize(out, original_size)
    return Image.fromarray(out)


def classify_garment(pil_img: Image.Image):
    """
    简单启发式分类：在白底商品图场景下区分上衣/裤子。
    """
    img = np.array(pil_img.convert("RGB"))

    fg_mask = np.any(img < 240, axis=2)
    if not np.any(fg_mask):
        return "unknown", 0.0

    ys, xs = np.where(fg_mask)
    y_min, y_max = int(np.min(ys)), int(np.max(ys))
    x_min, x_max = int(np.min(xs)), int(np.max(xs))

    box_h = max(1, y_max - y_min + 1)
    box_w = max(1, x_max - x_min + 1)
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

    top_score = 1.0 - pants_score
    top_score = max(0.55, min(0.95, top_score))
    return "top", float(round(top_score, 2))


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_PATH}


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

        # 4. 编码为 PNG base64（保留透明通道）
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

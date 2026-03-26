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
    返回 (category, score)
    """
    img = np.array(pil_img.convert("RGB"))

    # 白底抠前景：非接近白色区域视为衣物
    fg_mask = np.any(img < 240, axis=2)
    if not np.any(fg_mask):
        return "unknown", 0.0

    ys, xs = np.where(fg_mask)
    y_min, y_max = int(np.min(ys)), int(np.max(ys))
    x_min, x_max = int(np.min(xs)), int(np.max(xs))

    box_h = max(1, y_max - y_min + 1)
    box_w = max(1, x_max - x_min + 1)
    aspect_ratio = box_h / box_w

    # 前景中心在图中的垂直位置（0 顶部，1 底部）
    center_y = float(np.mean(ys)) / img.shape[0]

    # 裤子通常更细长（h/w大）且重心更靠下；上衣更靠上更宽
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

        category, score = classify_garment(pil_img)
        category_label = CATEGORY_LABELS.get(category, CATEGORY_LABELS["unknown"])

        input_tensor, original_size = preprocess_image(pil_img, MODEL_PATH)
        outputs = session.run(None, {input_name: input_tensor})
        result_img = postprocess_image(outputs[0], original_size)

        out_buf = BytesIO()
        result_img.save(out_buf, format="JPEG", quality=95)
        out_b64 = base64.b64encode(out_buf.getvalue()).decode("utf-8")

        return CartoonizeResp(
            imageBase64=out_b64,
            category=category,
            categoryLabel=category_label,
            categoryScore=score
        )
    except Exception as e:
        raise RuntimeError(f"cartoonize failed: {str(e)}")

import base64
from io import BytesIO

from fastapi import FastAPI
from pydantic import BaseModel
from PIL import Image

app = FastAPI()


class CartoonizeReq(BaseModel):
    imageBase64: str
    style: str = "cartoon"


class CartoonizeResp(BaseModel):
    imageBase64: str


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/cartoonize", response_model=CartoonizeResp)
def cartoonize(req: CartoonizeReq):
    """
    占位实现：
    - 把入参 base64 解码
    - 用 PIL 重新编码成 JPEG（相当于“处理”但不做换装模型）
    你后续把这里替换成 CartoonGAN 推理逻辑即可。
    """
    img_bytes = base64.b64decode(req.imageBase64)
    img = Image.open(BytesIO(img_bytes)).convert("RGB")

    out_buf = BytesIO()
    img.save(out_buf, format="JPEG", quality=90)
    out_b64 = base64.b64encode(out_buf.getvalue()).decode("utf-8")

    return CartoonizeResp(imageBase64=out_b64)


# 电子衣橱（微信小程序 + 云函数 + FastAPI）

本项目是一个可上传服装、自动卡通化并在模特图上进行虚拟试衣的微信小程序。

## 当前核心能力

- 衣橱页上传服装并调用云函数处理
- 云函数转发到 Python 服务进行卡通化与分类
- 自动输出分类：`top`（上衣）/`pants`（裤子）/`unknown`（未分类）
- 支持手动修正分类、备注、删除
- 首页按分类试衣、滑动切换、按姿态关键点叠加
- 裤子支持 `waistOffset`、`waistOffsetX` 的动态补偿

## 项目结构

```text
电子衣橱/
├── app.js
├── app.json
├── main.py                         # FastAPI 推理服务
├── requirements.txt                # Python 依赖
├── cloudfunctions/
│   ├── getOpenid/
│   ├── styleTransfer/              # 云函数：调用 Python 服务并回传 fileID
│   └── toggleLike/
├── pages/
│   ├── index/                      # 虚拟试衣间
│   ├── wardrobe/                   # 衣橱
│   ├── discover/
│   ├── profile/
│   ├── postDetail/
│   ├── publishPost/
│   ├── myPosts/
│   └── myFavorites/
└── utils/
    ├── db.js
    └── styleTransfer.js
```

## 环境要求

- 微信开发者工具（最新稳定版）
- Python 3.10+
- Node.js 18+（用于本地安装云函数依赖，推荐）

## 后端启动（FastAPI）

1. 安装依赖

```bash
pip install -r requirements.txt
```

2. 启动服务

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

3. 健康检查

访问：`http://127.0.0.1:8000/health`

> 如部署到云托管，请将云函数 `cloudfunctions/styleTransfer/index.js` 中 `CARTOON_API_BASE_URL` 配置为你的实际地址。

## 云函数部署建议

优先使用“本地安装依赖 + 上传所有文件”：

```bash
cd cloudfunctions/styleTransfer && npm install
cd ../getOpenid && npm install
cd ../toggleLike && npm install
```

在微信开发者工具中对每个云函数执行：
- 上传并部署：**所有文件**

## 小程序上传前检查清单

1. `app.json` 页面路径和 tabBar 图标路径存在
2. 云函数已成功部署（尤其 `styleTransfer`）
3. `styleTransfer` 云函数中的 Python 服务地址可访问
4. `main.py` 对应服务已部署且模型文件存在（`models/animeganv3.onnx`）
5. 真机测试过：上传、分类修改、删除、首页试衣切换

## 已知注意事项

- 如果衣橱删除后“又出现”，通常是并发刷新导致旧快照覆盖，需要使用 latest storage + 请求序号防并发方案。
- 首次上传新服装后首页不显示，通常是当前筛选分类不同，请切换分类确认。
- 裤子/上衣贴合依赖姿态关键点与参数，换模特图后建议重新校准 `pages/index/index.js`。

## 许可证

MIT

const cloud = require('wx-server-sdk')
const https = require('https')
const { URL } = require('url')

cloud.init({
  env: 'cloudbase-4gs0jhxs450a93bc'
})

// 云托管 Python 服务地址（不带路径）
const CARTOON_API_BASE_URL = 'https://django-1dr6-238609-10-1416141111.sh.run.tcloudbase.com'

function postJson(url, body, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const payload = JSON.stringify(body)

    const req = https.request(
      {
        method: 'POST',
        protocol: urlObj.protocol,
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: timeoutMs
      },
      res => {
        let data = ''
        res.setEncoding('utf8')

        res.on('data', chunk => {
          data += chunk
        })

        res.on('end', () => {
          try {
            const parsed = JSON.parse(data)
            if (res.statusCode >= 400) {
              reject(new Error(`Python API HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`))
              return
            }
            resolve({ statusCode: res.statusCode, data: parsed })
          } catch (e) {
            reject(new Error(`Python API 返回非 JSON: ${data}`))
          }
        })
      }
    )

    req.on('timeout', () => {
      req.destroy(new Error('Python API 请求超时'))
    })

    req.on('error', reject)

    req.write(payload)
    req.end()
  })
}

exports.main = async (event) => {
  try {
    const inputFileID = event.imagePath
    if (!inputFileID) {
      return { success: false, error: '缺少 imagePath（原图 fileID）' }
    }

    // 1. 下载原图
    const downloadRes = await cloud.downloadFile({ fileID: inputFileID })
    const inputBuffer = downloadRes.fileContent

    // 2. 调用云托管 Python API（返回卡通图 + 分类结果）
    const inputBase64 = inputBuffer.toString('base64')
    const apiResp = await postJson(`${CARTOON_API_BASE_URL}/cartoonize`, {
      imageBase64: inputBase64,
      style: 'cartoon'
    })

    const outputBase64 = apiResp && apiResp.data && apiResp.data.imageBase64
    if (!outputBase64) {
      throw new Error(`Python API 缺少 imageBase64 字段: ${JSON.stringify(apiResp && apiResp.data)}`)
    }

    const outputBuffer = Buffer.from(outputBase64, 'base64')

    // 3. 上传处理结果到云存储
    const uploadRes = await cloud.uploadFile({
      cloudPath: `cartoon/${Date.now()}-${Math.random().toString(36).slice(2)}.png`,
      fileContent: outputBuffer
    })

    return {
      success: true,
      cartoonUrl: uploadRes.fileID,
      category: (apiResp.data && apiResp.data.category) || 'unknown',
      categoryLabel: (apiResp.data && apiResp.data.categoryLabel) || '未分类',
      categoryScore: Number((apiResp.data && apiResp.data.categoryScore) || 0),
      waistOffset: Number((apiResp.data && apiResp.data.waistOffset) || 0),
      waistOffsetX: Number((apiResp.data && apiResp.data.waistOffsetX) || 0)
    }
  } catch (e) {
    return {
      success: false,
      error: e.message || String(e)
    }
  }
}

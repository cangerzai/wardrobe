// utils/styleTransfer.js
// 风格迁移服务工具函数

/**
 * 将图片转换为卡通风格并返回分类信息
 * @param {string} imagePath - 原图在云存储里的 fileID
 * @returns {Promise<{cartoonFileID:string, category:string, categoryLabel:string, categoryScore:number}>}
 */
async function transferToCartoon(imagePath) {
  return await callCloudFunction(imagePath)
}

/**
 * 调用云函数进行风格迁移
 */
async function callCloudFunction(imagePath) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'styleTransfer',
      data: {
        imagePath: imagePath
      },
      success: res => {
        if (res.result && res.result.success) {
          resolve({
            cartoonFileID: res.result.cartoonUrl,
            category: res.result.category || 'unknown',
            categoryLabel: res.result.categoryLabel || '未分类',
            categoryScore: Number(res.result.categoryScore || 0)
          })
        } else {
          reject(new Error((res.result && res.result.error) || '风格迁移失败'))
        }
      },
      fail: err => {
        reject(err)
      }
    })
  })
}

module.exports = {
  transferToCartoon
}

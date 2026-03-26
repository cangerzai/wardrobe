// pages/wardrobe/wardrobe.js
const styleTransferService = require('../../utils/styleTransfer.js')

Page({
  data: {
    clothesList: [],
    isProcessing: false
  },

  onLoad() {
    this.loadWardrobeData()
  },

  onShow() {
    // 每次显示页面时刷新数据
    this.loadWardrobeData()
  },

  // 加载衣橱数据
  loadWardrobeData() {
    const wardrobeData = wx.getStorageSync('wardrobeData') || []
    this.setData({
      clothesList: wardrobeData
    })
  },

  // 选择图片
  chooseImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0]
        this.uploadAndProcessImage(tempFilePath)
      },
      fail: (err) => {
        console.error('选择图片失败', err)
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        })
      }
    })
  },

  // 上传并处理图片
  async uploadAndProcessImage(filePath) {
    this.setData({
      isProcessing: true
    })

    try {
      // 1. 上传原图到云存储（如果使用云开发）
      const originalFileID = await this.uploadToCloud(filePath)
      
      // 2. 调用风格迁移服务
      wx.showLoading({
        title: '正在处理...',
        mask: true
      })

      // 原图也转成临时 URL，保证之后预览/绘制可用
      const originalUrl = await this.getTempFileURL(originalFileID)
      const cartoonUrl = await styleTransferService.transferToCartoon(originalFileID)
      
      // 3. 保存到本地存储
      const newClothes = {
        id: Date.now().toString(),
        name: `服装_${new Date().toLocaleDateString()}`,
        originalUrl: originalUrl,
        cartoonUrl: cartoonUrl,
        date: new Date().toLocaleDateString('zh-CN'),
        uploadTime: Date.now()
      }

      const wardrobeData = wx.getStorageSync('wardrobeData') || []
      wardrobeData.unshift(newClothes) // 新上传的放在最前面
      wx.setStorageSync('wardrobeData', wardrobeData)

      // 4. 更新页面数据
      this.setData({
        clothesList: wardrobeData,
        isProcessing: false
      })

      wx.hideLoading()
      wx.showToast({
        title: '上传成功',
        icon: 'success'
      })

    } catch (error) {
      console.error('处理图片失败', error)
      this.setData({
        isProcessing: false
      })
      wx.hideLoading()
      wx.showToast({
        title: error.message || '处理失败',
        icon: 'none',
        duration: 2000
      })
    }
  },

  // 上传到云存储（示例）
  async uploadToCloud(filePath) {
    return new Promise((resolve, reject) => {
      const cloudPath = `clothes/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`
      
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath,
        success: res => {
          resolve(res.fileID)
        },
        fail: err => {
          reject(err)
        }
      })
    })
  },

  // 把云存储 fileID 转成临时可访问 URL（用于 <image src="">）
  getTempFileURL(fileID) {
    return new Promise((resolve, reject) => {
      wx.cloud.getTempFileURL({
        fileList: [{ fileID }],
        success: res => {
          const tempFileURL = res.fileList && res.fileList[0] && res.fileList[0].tempFileURL
          if (!tempFileURL) {
            reject(new Error('获取临时文件 URL 失败'))
            return
          }
          resolve(tempFileURL)
        },
        fail: reject
      })
    })
  },

  // 预览服装
  previewClothes(e) {
    const index = e.currentTarget.dataset.index
    const item = this.data.clothesList[index]
    
    wx.previewImage({
      urls: [item.cartoonUrl || item.originalUrl],
      current: item.cartoonUrl || item.originalUrl
    })
  },

  // 删除服装
  deleteClothes(e) {
    const id = e.currentTarget.dataset.id
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这件服装吗？',
      success: (res) => {
        if (res.confirm) {
          const wardrobeData = this.data.clothesList.filter(item => item.id !== id)
          wx.setStorageSync('wardrobeData', wardrobeData)
          this.setData({
            clothesList: wardrobeData
          })
          
          wx.showToast({
            title: '删除成功',
            icon: 'success'
          })
        }
      }
    })
  }
})

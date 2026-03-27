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
    this.loadWardrobeData()
  },

  // 加载衣橱数据
  async loadWardrobeData() {
    const wardrobeData = wx.getStorageSync('wardrobeData') || []

    for (let i = 0; i < wardrobeData.length; i++) {
      const item = wardrobeData[i]
      item.cartoonUrl = ''
      item.originalUrl = ''
      // 先清空旧链接，避免加载过期 URL 触发 403
      item.cartoonUrl = ''
      item.originalUrl = ''
      try {
        if (item.cartoonFileID) {
          item.cartoonUrl = await this.getTempFileURL(item.cartoonFileID)
        }
        if (item.originalFileID) {
          item.originalUrl = await this.getTempFileURL(item.originalFileID)
        }
      } catch (e) {
        console.warn('衣橱页刷新临时链接失败', e)
      }
    }

    wx.setStorageSync('wardrobeData', wardrobeData)

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
    this.setData({ isProcessing: true })

    try {
      const originalFileID = await this.uploadToCloud(filePath)

      wx.showLoading({ title: '正在处理...', mask: true })

      const originalUrl = await this.getTempFileURL(originalFileID)
      const transferResult = await styleTransferService.transferToCartoon(originalFileID)
      const cartoonFileID = transferResult.cartoonFileID
      const cartoonUrl = await this.getTempFileURL(cartoonFileID)

      const newClothes = {
        id: Date.now().toString(),
        name: '新服装',
        originalFileID,
        cartoonFileID,
        originalUrl,
        cartoonUrl,
        category: transferResult.category || 'unknown',
        categoryLabel: transferResult.categoryLabel || '未分类',
        categoryScore: Number(transferResult.categoryScore || 0),
        remark: '',
        uploadTime: Date.now()
      }

      const wardrobeData = wx.getStorageSync('wardrobeData') || []
      wardrobeData.unshift(newClothes)
      wx.setStorageSync('wardrobeData', wardrobeData)

      this.setData({ clothesList: wardrobeData, isProcessing: false })
      wx.hideLoading()
      wx.showToast({ title: '上传成功', icon: 'success' })
    } catch (error) {
      console.error('处理图片失败', error)
      this.setData({ isProcessing: false })
      wx.hideLoading()
      wx.showToast({
        title: error.message || '处理失败',
        icon: 'none',
        duration: 2000
      })
    }
  },

  // 上传到云存储
  async uploadToCloud(filePath) {
    return new Promise((resolve, reject) => {
      const cloudPath = `clothes/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`
      wx.cloud.uploadFile({
        cloudPath,
        filePath,
        success: res => resolve(res.fileID),
        fail: err => reject(err)
      })
    })
  },

  // 获取临时文件 URL
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
    const type = e.currentTarget.dataset.type || 'cartoon'
    const item = this.data.clothesList[index]

    const targetUrl = type === 'original'
      ? (item.originalUrl || item.cartoonUrl)
      : (item.cartoonUrl || item.originalUrl)

    if (!targetUrl) {
      wx.showToast({ title: '图片暂不可预览', icon: 'none' })
      return
    }

    wx.previewImage({ urls: [targetUrl], current: targetUrl })
  },

  // 长按分类标签，手动修改分类
  onCategoryLongPress(e) {
    const id = e.currentTarget.dataset.id
    wx.showActionSheet({
      itemList: ['上衣', '裤子', '未分类'],
      success: (res) => {
        const categories = [
          { category: 'top', categoryLabel: '上衣' },
          { category: 'pants', categoryLabel: '裤子' },
          { category: 'unknown', categoryLabel: '未分类' }
        ]
        const selected = categories[res.tapIndex]
        const wardrobeData = this.data.clothesList.map(item => {
          if (item.id === id) {
            return { ...item, category: selected.category, categoryLabel: selected.categoryLabel }
          }
          return item
        })
        wx.setStorageSync('wardrobeData', wardrobeData)
        this.setData({ clothesList: wardrobeData })
        wx.showToast({ title: '分类已更新', icon: 'success' })
      }
    })
  },

  // 备注输入
  onRemarkInput(e) {
    const id = e.currentTarget.dataset.id
    const remark = e.detail.value

    const wardrobeData = this.data.clothesList.map(item => {
      if (item.id === id) return { ...item, remark }
      return item
    })

    wx.setStorageSync('wardrobeData', wardrobeData)
    this.setData({ clothesList: wardrobeData })
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
          this.setData({ clothesList: wardrobeData })
          wx.showToast({ title: '删除成功', icon: 'success' })
        }
      }
    })
  }
})

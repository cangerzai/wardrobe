// pages/wardrobe/wardrobe.js
const styleTransferService = require('../../utils/styleTransfer.js')

Page({
  data: {
    clothesList: [],
    isProcessing: false
  },

  onLoad() {
    // sequence id to drop stale async refresh results
    this._loadSeq = 0
    this.loadWardrobeData()
  },

  onShow() {
    this.loadWardrobeData()
  },

  // load wardrobe list and refresh temp urls safely
  async loadWardrobeData() {
    const seq = (this._loadSeq || 0) + 1
    this._loadSeq = seq

    const snapshot = wx.getStorageSync('wardrobeData') || []
    const tempUrlMap = {}

    for (let i = 0; i < snapshot.length; i++) {
      const item = snapshot[i]
      const nextItem = { ...item, cartoonUrl: '', originalUrl: '' }

      try {
        if (item.cartoonFileID) {
          nextItem.cartoonUrl = await this.getTempFileURL(item.cartoonFileID)
        }
        if (item.originalFileID) {
          nextItem.originalUrl = await this.getTempFileURL(item.originalFileID)
        }
      } catch (e) {
        console.warn('wardrobe temp url refresh failed', e)
      }

      tempUrlMap[nextItem.id] = nextItem
    }

    if (seq !== this._loadSeq) return

    const latest = wx.getStorageSync('wardrobeData') || []
    const merged = latest.map(item => {
      const cached = tempUrlMap[item.id]
      return cached
        ? { ...item, cartoonUrl: cached.cartoonUrl, originalUrl: cached.originalUrl }
        : { ...item, cartoonUrl: '', originalUrl: '' }
    })

    this.setData({ clothesList: merged })
  },

  // choose image
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
        console.error('choose image failed', err)
        wx.showToast({
          title: '\u9009\u62e9\u56fe\u7247\u5931\u8d25',
          icon: 'none'
        })
      }
    })
  },

  // upload and process image
  async uploadAndProcessImage(filePath) {
    this.setData({ isProcessing: true })

    try {
      const originalFileID = await this.uploadToCloud(filePath)

      wx.showLoading({ title: '\u6b63\u5728\u5904\u7406...', mask: true })

      const originalUrl = await this.getTempFileURL(originalFileID)
      const transferResult = await styleTransferService.transferToCartoon(originalFileID)
      const cartoonFileID = transferResult.cartoonFileID
      const cartoonUrl = await this.getTempFileURL(cartoonFileID)

      const newClothes = {
        id: Date.now().toString(),
        name: '\u65b0\u670d\u88c5',
        originalFileID,
        cartoonFileID,
        originalUrl,
        cartoonUrl,
        category: transferResult.category || 'unknown',
        categoryLabel: transferResult.categoryLabel || '\u672a\u5206\u7c7b',
        categoryScore: Number(transferResult.categoryScore || 0),
        waistOffset: Number(transferResult.waistOffset || 0),
        waistOffsetX: Number(transferResult.waistOffsetX || 0),
        remark: '',
        uploadTime: Date.now()
      }

      const wardrobeData = wx.getStorageSync('wardrobeData') || []
      wardrobeData.unshift(newClothes)
      wx.setStorageSync('wardrobeData', wardrobeData)

      this.setData({ clothesList: wardrobeData, isProcessing: false })
      wx.hideLoading()
      wx.showToast({ title: '\u4e0a\u4f20\u6210\u529f', icon: 'success' })
    } catch (error) {
      console.error('process image failed', error)
      this.setData({ isProcessing: false })
      wx.hideLoading()
      wx.showToast({
        title: error.message || '\u5904\u7406\u5931\u8d25',
        icon: 'none',
        duration: 2000
      })
    }
  },

  // upload to cloud storage
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

  // get temp file url
  getTempFileURL(fileID) {
    return new Promise((resolve, reject) => {
      wx.cloud.getTempFileURL({
        fileList: [{ fileID }],
        success: res => {
          const tempFileURL = res.fileList && res.fileList[0] && res.fileList[0].tempFileURL
          if (!tempFileURL) {
            reject(new Error('\u83b7\u53d6\u4e34\u65f6\u6587\u4ef6 URL \u5931\u8d25'))
            return
          }
          resolve(tempFileURL)
        },
        fail: reject
      })
    })
  },

  // preview clothes image
  previewClothes(e) {
    const index = e.currentTarget.dataset.index
    const type = e.currentTarget.dataset.type || 'cartoon'
    const item = this.data.clothesList[index]

    const targetUrl = type === 'original'
      ? (item.originalUrl || item.cartoonUrl)
      : (item.cartoonUrl || item.originalUrl)

    if (!targetUrl) {
      wx.showToast({ title: '\u56fe\u7247\u6682\u4e0d\u53ef\u9884\u89c8', icon: 'none' })
      return
    }

    wx.previewImage({ urls: [targetUrl], current: targetUrl })
  },

  // long press category badge to modify category
  onCategoryLongPress(e) {
    const id = e.currentTarget.dataset.id
    wx.showActionSheet({
      itemList: ['\u4e0a\u8863', '\u88e4\u5b50', '\u672a\u5206\u7c7b'],
      success: (res) => {
        const categories = [
          { category: 'top', categoryLabel: '\u4e0a\u8863' },
          { category: 'pants', categoryLabel: '\u88e4\u5b50' },
          { category: 'unknown', categoryLabel: '\u672a\u5206\u7c7b' }
        ]
        const selected = categories[res.tapIndex]

        const latest = wx.getStorageSync('wardrobeData') || []
        const wardrobeData = latest.map(item => {
          if (item.id === id) {
            return {
              ...item,
              category: selected.category,
              categoryLabel: selected.categoryLabel
            }
          }
          return item
        })

        wx.setStorageSync('wardrobeData', wardrobeData)
        this.setData({ clothesList: wardrobeData })
        wx.showToast({ title: '\u5206\u7c7b\u5df2\u66f4\u65b0', icon: 'success' })
      }
    })
  },

  // remark input
  onRemarkInput(e) {
    const id = e.currentTarget.dataset.id
    const remark = e.detail.value

    const latest = wx.getStorageSync('wardrobeData') || []
    const wardrobeData = latest.map(item => {
      if (item.id === id) return { ...item, remark }
      return item
    })

    wx.setStorageSync('wardrobeData', wardrobeData)
    this.setData({ clothesList: wardrobeData })
  },

  // delete clothes item
  deleteClothes(e) {
    const id = e.currentTarget.dataset.id

    wx.showModal({
      title: '\u786e\u8ba4\u5220\u9664',
      content: '\u786e\u5b9a\u8981\u5220\u9664\u8fd9\u4ef6\u670d\u88c5\u5417\uff1f',
      success: (res) => {
        if (res.confirm) {
          const latest = wx.getStorageSync('wardrobeData') || []
          const wardrobeData = latest.filter(item => item.id !== id)

          wx.setStorageSync('wardrobeData', wardrobeData)
          this.setData({ clothesList: wardrobeData })
          wx.showToast({ title: '\u5220\u9664\u6210\u529f', icon: 'success' })
        }
      }
    })
  }
})

// pages/index/index.js
const app = getApp()

Page({
  data: {
    clothesList: [],
    currentIndex: 0,
    currentClothes: {},
    isLoading: false,
    touchStartX: 0,
    touchStartY: 0,
    canvasContext: null,
    characterImage: null,
    pageActive: true
  },

  onLoad() {
    this.setData({ pageActive: true })
    this.loadWardrobeData()
    this.initCanvas()
  },

  onShow() {
    this.setData({ pageActive: true })
    this.loadWardrobeData()
  },

  onHide() {
    this.setData({ pageActive: false })
    if (this.drawTimer) {
      clearTimeout(this.drawTimer)
      this.drawTimer = null
    }
  },

  onUnload() {
    this.setData({ pageActive: false })
    if (this.drawTimer) {
      clearTimeout(this.drawTimer)
      this.drawTimer = null
    }
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

  // 加载衣橱数据
  async loadWardrobeData() {
    const wardrobeData = wx.getStorageSync('wardrobeData') || []

    for (let i = 0; i < wardrobeData.length; i++) {
      const item = wardrobeData[i]

      try {
        if (item.cartoonFileID) {
          item.cartoonUrl = await this.getTempFileURL(item.cartoonFileID)
        }

        if (item.originalFileID) {
          item.originalUrl = await this.getTempFileURL(item.originalFileID)
        }
      } catch (e) {
        console.warn('刷新临时链接失败', e)
      }
    }

    if (!this.data.pageActive) return

    wx.setStorageSync('wardrobeData', wardrobeData)

    this.setData({
      clothesList: wardrobeData,
      currentIndex: wardrobeData.length > 0 ? 0 : -1,
      currentClothes: wardrobeData.length > 0 ? wardrobeData[0] : {}
    })

    if (wardrobeData.length > 0 && this.data.canvasContext && this.data.pageActive) {
      this.drawCharacter()
    }
  },

  // 初始化Canvas
  initCanvas() {
    const ctx = wx.createCanvasContext('characterCanvas', this)

    this.setData({
      canvasContext: ctx,
      canvasWidth: 300,
      canvasHeight: 400
    })

    this.loadCharacterImage()
  },

  // 加载基础卡通小人图片
  loadCharacterImage() {
    this.drawBaseCharacter()
  },

  // 绘制基础卡通小人
  drawBaseCharacter() {
    const ctx = this.data.canvasContext
    if (!ctx) return

    const width = this.data.canvasWidth || 300
    const height = this.data.canvasHeight || 400

    ctx.clearRect(0, 0, width, height)

    ctx.setFillStyle('#f0f9ff')
    ctx.fillRect(0, 0, width, height)

    // 头部
    ctx.beginPath()
    ctx.arc(width / 2, 80, 50, 0, Math.PI * 2)
    ctx.setFillStyle('#ffe4b5')
    ctx.fill()
    ctx.setStrokeStyle('#333')
    ctx.setLineWidth(2)
    ctx.stroke()

    // 眼睛
    ctx.beginPath()
    ctx.arc(width / 2 - 15, 75, 5, 0, Math.PI * 2)
    ctx.arc(width / 2 + 15, 75, 5, 0, Math.PI * 2)
    ctx.setFillStyle('#333')
    ctx.fill()

    // 嘴巴
    ctx.beginPath()
    ctx.arc(width / 2, 90, 10, 0, Math.PI)
    ctx.setStrokeStyle('#333')
    ctx.setLineWidth(2)
    ctx.stroke()

    // 身体
    ctx.setFillStyle('#87ceeb')
    ctx.fillRect(width / 2 - 40, 130, 80, 120)

    // 手臂
    ctx.setFillStyle('#ffe4b5')
    ctx.fillRect(width / 2 - 60, 140, 20, 80)
    ctx.fillRect(width / 2 + 40, 140, 20, 80)

    // 腿部
    ctx.setFillStyle('#4169e1')
    ctx.fillRect(width / 2 - 30, 250, 25, 100)
    ctx.fillRect(width / 2 + 5, 250, 25, 100)

    // 脚
    ctx.setFillStyle('#333')
    ctx.fillRect(width / 2 - 35, 350, 30, 20)
    ctx.fillRect(width / 2 + 5, 350, 30, 20)

    if (this.data.currentClothes && this.data.currentClothes.cartoonUrl) {
      this.drawClothes(this.data.currentClothes.cartoonUrl)
    } else {
      ctx.draw()
    }
  },

  // 绘制服装
  drawClothes(imageUrl) {
    const ctx = this.data.canvasContext
    if (!ctx) return

    if (!imageUrl || !this.data.pageActive) {
      ctx.draw()
      return
    }

    const width = this.data.canvasWidth || 300

    wx.getImageInfo({
      src: imageUrl,
      success: (res) => {
        if (!this.data.pageActive) return
        ctx.drawImage(res.path, width / 2 - 60, 130, 120, 150)
        ctx.draw()
      },
      fail: (err) => {
        if (this.data.pageActive) {
          console.warn('服装图片加载失败', err)
          ctx.draw()
        }
      }
    })
  },

  // 绘制完整角色
  drawCharacter() {
    if (!this.data.pageActive) return

    this.drawBaseCharacter()

    if (this.drawTimer) {
      clearTimeout(this.drawTimer)
      this.drawTimer = null
    }

    if (this.data.currentClothes && this.data.currentClothes.cartoonUrl) {
      this.drawTimer = setTimeout(() => {
        if (!this.data.pageActive) return
        this.drawClothes(this.data.currentClothes.cartoonUrl)
      }, 100)
    }
  },

  // 触摸开始
  onTouchStart(e) {
    this.setData({
      touchStartX: e.touches[0].clientX,
      touchStartY: e.touches[0].clientY
    })
  },

  // 触摸移动
  onTouchMove() {},

  // 触摸结束
  onTouchEnd(e) {
    const deltaX = e.changedTouches[0].clientX - this.data.touchStartX
    const deltaY = e.changedTouches[0].clientY - this.data.touchStartY

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX > 0) {
        this.switchToPrevious()
      } else {
        this.switchToNext()
      }
    }
  },

  // 切换到下一件服装
  switchToNext() {
    const { clothesList, currentIndex } = this.data
    if (clothesList.length === 0) return

    const nextIndex = (currentIndex + 1) % clothesList.length
    this.switchClothes(nextIndex)
  },

  // 切换到上一件服装
  switchToPrevious() {
    const { clothesList, currentIndex } = this.data
    if (clothesList.length === 0) return

    const prevIndex = currentIndex === 0 ? clothesList.length - 1 : currentIndex - 1
    this.switchClothes(prevIndex)
  },

  // 切换服装
  async switchClothes(index) {
    const item = this.data.clothesList[index] || {}

    this.setData({
      currentIndex: index,
      currentClothes: item,
      isLoading: true
    })

    try {
      if (item.cartoonFileID) {
        item.cartoonUrl = await this.getTempFileURL(item.cartoonFileID)
      }
      if (item.originalFileID) {
        item.originalUrl = await this.getTempFileURL(item.originalFileID)
      }
    } catch (e) {
      console.warn('切换服装时刷新临时链接失败', e)
    }

    if (!this.data.pageActive) return

    this.setData({
      currentClothes: item
    })

    if (this.drawTimer) {
      clearTimeout(this.drawTimer)
      this.drawTimer = null
    }

    this.drawTimer = setTimeout(() => {
      if (!this.data.pageActive) return
      this.drawCharacter()
      this.setData({
        isLoading: false
      })
    }, 200)
  }
})

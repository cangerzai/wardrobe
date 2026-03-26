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
  },

  onLoad() {
    this.loadWardrobeData()
    this.initCanvas()
  },

  onShow() {
    // 每次显示页面时刷新数据
    this.loadWardrobeData()
  },

  // 加载衣橱数据
  loadWardrobeData() {
    const wardrobeData = wx.getStorageSync('wardrobeData') || []
    this.setData({
      clothesList: wardrobeData,
      currentIndex: wardrobeData.length > 0 ? 0 : -1,
      currentClothes: wardrobeData.length > 0 ? wardrobeData[0] : {}
    })
    
    if (wardrobeData.length > 0) {
      this.drawCharacter()
    }
  },

  // 初始化Canvas
  initCanvas() {
    // 使用传统Canvas API（更兼容）
    const ctx = wx.createCanvasContext('characterCanvas', this)
    
    // 获取系统信息用于适配
    const systemInfo = wx.getSystemInfoSync()
    const dpr = systemInfo.pixelRatio || 1
    
    this.setData({
      canvasContext: ctx,
      canvasWidth: 300,
      canvasHeight: 400
    })
    
    // 加载基础卡通小人图片
    this.loadCharacterImage()
  },

  // 加载基础卡通小人图片
  loadCharacterImage() {
    // 这里使用Canvas绘制一个简单的卡通小人
    // 实际项目中可以加载图片资源
    this.drawBaseCharacter()
  },

  // 绘制基础卡通小人
  drawBaseCharacter() {
    const ctx = this.data.canvasContext
    if (!ctx) return

    const width = this.data.canvasWidth || 300
    const height = this.data.canvasHeight || 400

    // 清空画布
    ctx.clearRect(0, 0, width, height)

    // 绘制背景
    ctx.setFillStyle('#f0f9ff')
    ctx.fillRect(0, 0, width, height)

    // 绘制头部（圆形）
    ctx.beginPath()
    ctx.arc(width / 2, 80, 50, 0, Math.PI * 2)
    ctx.setFillStyle('#ffe4b5')
    ctx.fill()
    ctx.setStrokeStyle('#333')
    ctx.setLineWidth(2)
    ctx.stroke()

    // 绘制眼睛
    ctx.beginPath()
    ctx.arc(width / 2 - 15, 75, 5, 0, Math.PI * 2)
    ctx.arc(width / 2 + 15, 75, 5, 0, Math.PI * 2)
    ctx.setFillStyle('#333')
    ctx.fill()

    // 绘制嘴巴
    ctx.beginPath()
    ctx.arc(width / 2, 90, 10, 0, Math.PI)
    ctx.setStrokeStyle('#333')
    ctx.setLineWidth(2)
    ctx.stroke()

    // 绘制身体（矩形）
    ctx.setFillStyle('#87ceeb')
    ctx.fillRect(width / 2 - 40, 130, 80, 120)

    // 绘制手臂
    ctx.setFillStyle('#ffe4b5')
    ctx.fillRect(width / 2 - 60, 140, 20, 80)
    ctx.fillRect(width / 2 + 40, 140, 20, 80)

    // 绘制腿部
    ctx.setFillStyle('#4169e1')
    ctx.fillRect(width / 2 - 30, 250, 25, 100)
    ctx.fillRect(width / 2 + 5, 250, 25, 100)

    // 绘制脚
    ctx.setFillStyle('#333')
    ctx.fillRect(width / 2 - 35, 350, 30, 20)
    ctx.fillRect(width / 2 + 5, 350, 30, 20)

    // 如果有当前服装，绘制服装
    if (this.data.currentClothes && this.data.currentClothes.cartoonUrl) {
      this.drawClothes(this.data.currentClothes.cartoonUrl)
    } else {
      // 绘制完成，需要调用draw()方法
      ctx.draw()
    }
  },

  // 绘制服装
  drawClothes(imageUrl) {
    const ctx = this.data.canvasContext
    if (!ctx || !imageUrl) {
      ctx.draw()
      return
    }

    const width = this.data.canvasWidth || 300
    
    // 使用wx.getImageInfo获取图片信息
    wx.getImageInfo({
      src: imageUrl,
      success: (res) => {
        // 绘制服装图片，覆盖在身体上
        ctx.drawImage(res.path, width / 2 - 60, 130, 120, 150)
        ctx.draw()
      },
      fail: (err) => {
        console.error('服装图片加载失败', err)
        ctx.draw()
      }
    })
  },

  // 绘制完整角色（基础小人+服装）
  drawCharacter() {
    this.drawBaseCharacter()
    if (this.data.currentClothes && this.data.currentClothes.cartoonUrl) {
      // 延迟绘制服装，确保基础小人已绘制
      setTimeout(() => {
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
  onTouchMove(e) {
    // 可以在这里添加滑动时的视觉反馈
  },

  // 触摸结束
  onTouchEnd(e) {
    const deltaX = e.changedTouches[0].clientX - this.data.touchStartX
    const deltaY = e.changedTouches[0].clientY - this.data.touchStartY
    
    // 判断是否为有效的左右滑动
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX > 0) {
        // 向右滑动，切换到上一件
        this.switchToPrevious()
      } else {
        // 向左滑动，切换到下一件
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
  switchClothes(index) {
    this.setData({
      currentIndex: index,
      currentClothes: this.data.clothesList[index] || {},
      isLoading: true
    })

    // 重新绘制角色
    setTimeout(() => {
      this.drawCharacter()
      this.setData({
        isLoading: false
      })
    }, 200)
  }
})

// pages/index/index.js
const CARTOON_API_BASE = 'https://django-1dr6-238609-10-1416141111.sh.run.tcloudbase.com'

// 把本地图片文件转 base64
function fileToBase64(path) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath: path,
      encoding: 'base64',
      success: res => resolve(res.data),
      fail: reject
    })
  })
}

Page({
  data: {
    allClothesList: [],
    filteredList: [],
    currentFilterIndex: 0,
    currentClothes: {},
    activeCategory: 'top',
    categoryLabel: '上衣',
    showDropdown: false,
    touchStartX: 0,
    selectedTop: null,
    selectedPants: null,
    // 模特关键点（归一化坐标 0~1）
    pose: null,
    // 根据关键点计算出的服装叠加样式（rpx 单位）
    topStyle: '',
    pantsStyle: ''
  },

  onLoad() {
    // 先用默认关键点渲染，保证服装立即可见
    const defaultPose = {
      leftShoulder:  [0.32, 0.20], rightShoulder: [0.68, 0.20],
      leftHip:       [0.36, 0.50], rightHip:      [0.64, 0.50],
      leftKnee:      [0.37, 0.72], rightKnee:     [0.63, 0.72],
      imageWidth: 600, imageHeight: 900
    }
    this._recalcStyles(defaultPose)
    this.loadWardrobeData()
    this.loadModelPose()
  },

  onShow() {
    this.loadWardrobeData()
  },

  // 加载模特关键点（只需加载一次）
  async loadModelPose() {
    // 读取本地模特图转 base64 发给 Python 服务
    try {
      const base64 = await fileToBase64('/images/model.png')
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: CARTOON_API_BASE + '/pose',
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          data: JSON.stringify({ imageBase64: base64 }),
          success: res => resolve(res),
          fail: reject
        })
      })
      if (res.statusCode === 200 && res.data) {
        const pose = res.data
        this.setData({ pose })
        this._recalcStyles(pose)
      }
    } catch (e) {
      console.warn('获取模特关键点失败，使用默认布局', e)
      // 使用默认关键点
      const pose = {
        leftShoulder:  [0.38, 0.22], rightShoulder: [0.62, 0.22],
        leftHip:       [0.40, 0.52], rightHip:      [0.60, 0.52],
        leftKnee:      [0.41, 0.73], rightKnee:     [0.59, 0.73],
        imageWidth: 600, imageHeight: 900
      }
      this.setData({ pose })
      this._recalcStyles(pose)
    }
  },

  // 根据关键点计算服装叠加的 CSS style 字符串
  // model-stage 在页面中的实际渲染宽度约为 屏幕宽 - 48rpx padding
  // 我们用百分比定位，兼容不同屏幕
  _recalcStyles(pose) {
    if (!pose) return
    const ls = pose.leftShoulder
    const rs = pose.rightShoulder
    const lh = pose.leftHip
    const rh = pose.rightHip
    const lk = pose.leftKnee
    const rk = pose.rightKnee

    // ── 上衣区域 ──
    // 上移并放大：更贴合新模特
    const topY       = Math.max(0, ls[1] - 0.05)
    const topBottom  = (lh[1] + rh[1]) / 2 + 0.06
    const topH       = topBottom - topY
    // 上衣宽度增大
    const topW       = 0.78
    const topCenterX = (ls[0] + rs[0]) / 2
    const topLeft    = Math.max(0, topCenterX - topW / 2)

    // ── 裤子区域 ──
    // 对齐模特白色短裤的腰部最上方
    const basePantsY = 0.37
    const selectedPantsOffset = Number((this.data.selectedPants && this.data.selectedPants.waistOffset) || 0)
    // 补偿系数可调：0.85（建议 0.7 ~ 1.0）
    const pantsY = Math.max(0, basePantsY - selectedPantsOffset * 0.85)
    const pantsBottom = Math.min(1.0, 0.98)
    const pantsH      = pantsBottom - pantsY
    const pantsW      = 0.80
    const pantsCenterX = (lh[0] + rh[0]) / 2 
    const pantsLeft   = Math.max(0, pantsCenterX - pantsW / 2)

    // 转成百分比 style 字符串
    const pct = v => (v * 100).toFixed(2) + '%'
    const topStyle = [
      'position:absolute',
      `top:${pct(topY)}`,
      `left:${pct(topLeft)}`,
      `width:${pct(topW)}`,
      `height:${pct(topH)}`,
      'z-index:2',
      'pointer-events:none'
    ].join(';')

    const pantsStyle = [
      'position:absolute',
      `top:${pct(pantsY)}`,
      `left:${pct(pantsLeft)}`,
      `width:${pct(pantsW)}`,
      `height:${pct(pantsH)}`,
      'z-index:1',
      'pointer-events:none'
    ].join(';')

    this.setData({ topStyle, pantsStyle })
  },

  getTempFileURL(fileID) {
    return new Promise((resolve, reject) => {
      wx.cloud.getTempFileURL({
        fileList: [{ fileID }],
        success: res => {
          const url = res.fileList && res.fileList[0] && res.fileList[0].tempFileURL
          resolve(url || '')
        },
        fail: reject
      })
    })
  },

  async loadWardrobeData() {
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
        console.warn('刷新临时链接失败', e)
      }
      tempUrlMap[nextItem.id] = nextItem
    }

    // 最终以最新 storage 为准，避免旧快照回写覆盖
    const latest = wx.getStorageSync('wardrobeData') || []
    const merged = latest.map(item => {
      const cached = tempUrlMap[item.id]
      return cached
        ? { ...item, cartoonUrl: cached.cartoonUrl, originalUrl: cached.originalUrl }
        : { ...item, cartoonUrl: '', originalUrl: '' }
    })

    this.setData({ allClothesList: merged })

    // 重新过滤，并强制刷新当前选中的服装（如果是新添加的）
    this.applyFilter(this.data.activeCategory, merged)

    // 若 pose 已加载，重新计算样式
    if (this.data.pose) {
      this._recalcStyles(this.data.pose)
    }
  },

  // 按分类过滤，并自动把第一件设为当前分类的已选项
  applyFilter(category, list) {
    const src = list || this.data.allClothesList
    const filtered = src.filter(item => item.category === category)
    const first = filtered[0] || null

    // 更新当前浏览的服装
    const update = {
      filteredList: filtered,
      currentFilterIndex: 0,
      currentClothes: first || {}
    }

    // 如果该分类还没有已选项，自动选第一件
    if (category === 'top' && !this.data.selectedTop && first) {
      update.selectedTop = first
    } else if (category === 'pants' && !this.data.selectedPants && first) {
      update.selectedPants = first
    }

    this.setData(update, () => {
      if (this.data.pose) this._recalcStyles(this.data.pose)
    })
  },

  toggleDropdown() {
    this.setData({ showDropdown: !this.data.showDropdown })
  },

  selectCategory(e) {
    const cat = e.currentTarget.dataset.cat
    const label = e.currentTarget.dataset.label

    // 切换分类前，把当前正在浏览的服装保存为该分类的已选项
    this._saveCurrentSelection()

    this.setData({
      activeCategory: cat,
      categoryLabel: label,
      showDropdown: false
    })
    this.applyFilter(cat)
  },

  // 把当前浏览的服装保存为对应分类的已选项
  _saveCurrentSelection() {
    const { activeCategory, currentClothes } = this.data
    if (!currentClothes || !currentClothes.cartoonUrl) return
    if (activeCategory === 'top') {
      this.setData({ selectedTop: currentClothes })
    } else if (activeCategory === 'pants') {
      this.setData({ selectedPants: currentClothes })
    }
  },

  onTouchStart(e) {
    this.setData({ touchStartX: e.touches[0].clientX })
  },

  onTouchEnd(e) {
    const deltaX = e.changedTouches[0].clientX - this.data.touchStartX
    if (Math.abs(deltaX) < 40) return
    if (deltaX > 0) {
      this.switchPrev()
    } else {
      this.switchNext()
    }
  },

  switchNext() {
    const { filteredList, currentFilterIndex, activeCategory } = this.data
    if (filteredList.length <= 1) return
    const next = (currentFilterIndex + 1) % filteredList.length
    const nextClothes = filteredList[next]
    const update = { currentFilterIndex: next, currentClothes: nextClothes }
    // 滑动时实时更新已选项
    if (activeCategory === 'top') update.selectedTop = nextClothes
    else update.selectedPants = nextClothes
    this.setData(update)
  },

  switchPrev() {
    const { filteredList, currentFilterIndex, activeCategory } = this.data
    if (filteredList.length <= 1) return
    const prev = currentFilterIndex === 0 ? filteredList.length - 1 : currentFilterIndex - 1
    const prevClothes = filteredList[prev]
    const update = { currentFilterIndex: prev, currentClothes: prevClothes }
    // 滑动时实时更新已选项
    if (activeCategory === 'top') update.selectedTop = prevClothes
    else update.selectedPants = prevClothes
    this.setData(update)
  }
})

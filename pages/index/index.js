// pages/index/index.js
Page({
  data: {
    allClothesList: [],
    filteredList: [],
    currentFilterIndex: 0,
    currentClothes: {},
    activeCategory: 'top',
    categoryLabel: '上衣',
    showDropdown: false,
    touchStartX: 0
  },

  onLoad() {
    this.loadWardrobeData()
  },

  onShow() {
    this.loadWardrobeData()
  },

  // 获取临时文件 URL
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

  // 加载衣橱数据并刷新临时链接
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

    wx.setStorageSync('wardrobeData', wardrobeData)
    this.setData({ allClothesList: wardrobeData })
    this.applyFilter(this.data.activeCategory, wardrobeData)
  },

  // 按分类过滤
  applyFilter(category, list) {
    const src = list || this.data.allClothesList
    const filtered = src.filter(item => item.category === category)
    const first = filtered[0] || {}
    this.setData({
      filteredList: filtered,
      currentFilterIndex: 0,
      currentClothes: first
    })
  },

  // 切换下拉展开
  toggleDropdown() {
    this.setData({ showDropdown: !this.data.showDropdown })
  },

  // 选择分类
  selectCategory(e) {
    const cat = e.currentTarget.dataset.cat
    const label = e.currentTarget.dataset.label
    this.setData({
      activeCategory: cat,
      categoryLabel: label,
      showDropdown: false
    })
    this.applyFilter(cat)
  },

  // 触摸开始
  onTouchStart(e) {
    this.setData({ touchStartX: e.touches[0].clientX })
  },

  // 触摸结束 → 判断左右滑动
  onTouchEnd(e) {
    const deltaX = e.changedTouches[0].clientX - this.data.touchStartX
    if (Math.abs(deltaX) < 40) return // 滑动距离太短忽略
    if (deltaX > 0) {
      this.switchPrev()
    } else {
      this.switchNext()
    }
  },

  switchNext() {
    const { filteredList, currentFilterIndex } = this.data
    if (filteredList.length <= 1) return
    const next = (currentFilterIndex + 1) % filteredList.length
    this.setData({
      currentFilterIndex: next,
      currentClothes: filteredList[next]
    })
  },

  switchPrev() {
    const { filteredList, currentFilterIndex } = this.data
    if (filteredList.length <= 1) return
    const prev = currentFilterIndex === 0 ? filteredList.length - 1 : currentFilterIndex - 1
    this.setData({
      currentFilterIndex: prev,
      currentClothes: filteredList[prev]
    })
  }
})

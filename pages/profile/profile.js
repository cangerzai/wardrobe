// pages/profile/profile.js
const app = getApp()

Page({
  data: {
    userInfo: {},
    clothesCount: 0,
    outfitCount: 0,
    favoriteCount: 0
  },

  onLoad() {
    this.loadUserData()
  },

  onShow() {
    this.loadUserData()
  },

  // 加载用户数据
  loadUserData() {
    // 获取用户信息
    const userInfo = app.globalData.userInfo || {}
    
    // 获取统计数据
    const wardrobeData = wx.getStorageSync('wardrobeData') || []
    
    this.setData({
      userInfo: userInfo,
      clothesCount: wardrobeData.length,
      outfitCount: 0, // 实际项目中应从服务器获取
      favoriteCount: 0 // 实际项目中应从服务器获取
    })
  },

  // 跳转到衣橱
  goToWardrobe() {
    wx.switchTab({
      url: '/pages/wardrobe/wardrobe'
    })
  },

  // 数据管理
  manageData() {
    wx.showModal({
      title: '数据管理',
      content: '可以在这里管理您的服装数据、备份和恢复等',
      showCancel: false
    })
  },

  // 设置
  settings() {
    wx.showModal({
      title: '设置',
      content: '可以在这里设置通知、隐私、主题等',
      showCancel: false
    })
  },

  // 关于
  about() {
    wx.showModal({
      title: '关于',
      content: '个性化电子衣橱 v1.0.0\n\n一个帮助您管理服装和搭配的小程序',
      showCancel: false
    })
  },

  // 清空所有数据
  clearAllData() {
    wx.showModal({
      title: '确认清空',
      content: '此操作将删除所有本地数据，且无法恢复。确定要继续吗？',
      confirmColor: '#dc2626',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('wardrobeData')
          this.setData({
            clothesCount: 0
          })
          wx.showToast({
            title: '已清空',
            icon: 'success'
          })
        }
      }
    })
  },

  // 导出数据
  exportData() {
    const wardrobeData = wx.getStorageSync('wardrobeData') || []
    
    if (wardrobeData.length === 0) {
      wx.showToast({
        title: '暂无数据可导出',
        icon: 'none'
      })
      return
    }

    // 将数据转换为JSON字符串
    const dataStr = JSON.stringify(wardrobeData, null, 2)
    
    // 实际项目中可以将数据上传到云存储或发送到服务器
    wx.showModal({
      title: '导出数据',
      content: `共 ${wardrobeData.length} 条数据\n\n实际项目中可以将数据导出为文件或上传到云端`,
      showCancel: false
    })
  }
})

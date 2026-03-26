// app.js
App({
  onLaunch() {
    // 初始化云开发
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloudbase-4gs0jhxs450a93bc', // 替换为你的云环境ID
        traceUser: true,
      })
    }

    // 获取用户信息
    this.getUserInfo()
    
    // 初始化本地存储的服装数据
    this.initWardrobeData()
  },

  // 获取用户信息
  getUserInfo() {
    wx.getSetting({
      success: res => {
        if (res.authSetting['scope.userInfo']) {
          wx.getUserInfo({
            success: res => {
              this.globalData.userInfo = res.userInfo
            }
          })
        }
      }
    })
  },

  // 初始化衣橱数据
  initWardrobeData() {
    const wardrobeData = wx.getStorageSync('wardrobeData')
    if (!wardrobeData) {
      wx.setStorageSync('wardrobeData', [])
    }
  },

  globalData: {
    userInfo: null,
    currentClothes: [], // 当前可用的服装列表
  }
})

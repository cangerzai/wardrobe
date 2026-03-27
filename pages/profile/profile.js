// pages/profile/profile.js
const app = getApp()
const dbUtil = require('../../utils/db.js')

Page({
  data: {
    userInfo: {},
    clothesCount: 0,
    outfitCount: 0,
    favoriteCount: 0,
    favoritePosts: [],
    showFavSection: false
  },

  onLoad() {
    this.loadUserData()
  },

  onShow() {
    this.loadUserData()
  },

  loadUserData() {
    const userInfo = app.globalData.userInfo || {}
    const wardrobeData = wx.getStorageSync('wardrobeData') || []

    this.setData({
      userInfo,
      clothesCount: wardrobeData.length
    })

    // 从云数据库拉收藏列表
    dbUtil.getMyFavIds().then(favIds => {
      if (favIds.length === 0) {
        this.setData({ favoriteCount: 0, favoritePosts: [], outfitCount: 0 })
        return
      }
      // 拉全部帖子，过滤出收藏的
      return dbUtil.getPosts().then(posts => {
        const favPosts = posts
          .filter(p => favIds.includes(p._id))
          .map(p => Object.assign({}, p, {
            id: p._id,
            image: p.imageUrl || p.imageFileID || ''
          }))

        // 我发布的帖子数
        const myPosts = posts.filter(p => {
          // 云数据库会自动注入 _openid，与当前用户匹配
          return p._openid !== undefined
        })

        this.setData({
          favoriteCount: favPosts.length,
          favoritePosts: favPosts,
          outfitCount: myPosts.length
        })

        // 批量刷新图片 URL
        const needUrl = favPosts.filter(p => p.imageFileID && !p.imageUrl)
        if (needUrl.length === 0) return
        Promise.all(needUrl.map(p =>
          dbUtil.getTempUrl(p.imageFileID).then(url => ({ id: p._id, url }))
        )).then(results => {
          const urlMap = {}
          results.forEach(r => { urlMap[r.id] = r.url })
          const updated = this.data.favoritePosts.map(p =>
            urlMap[p._id] ? Object.assign({}, p, { image: urlMap[p._id] }) : p
          )
          this.setData({ favoritePosts: updated })
        })
      })
    }).catch(err => {
      console.error('加载收藏失败', err)
    })
  },

  goToFavorites() {
    wx.navigateTo({ url: '/pages/myFavorites/myFavorites' })
  },

  toggleFavSection() {},

  goToWardrobe() {
    wx.switchTab({ url: '/pages/wardrobe/wardrobe' })
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/postDetail/postDetail?id=' + id })
  },

  manageData() {
    wx.showModal({
      title: '数据管理',
      content: '可以在这里管理您的服装数据、备份和恢复等',
      showCancel: false
    })
  },

  settings() {
    wx.showModal({
      title: '设置',
      content: '可以在这里设置通知、隐私、主题等',
      showCancel: false
    })
  },

  about() {
    wx.showModal({
      title: '关于',
      content: '个性化电子衣橱 v1.0.0\n\n一个帮助您管理服装和搭配的小程序',
      showCancel: false
    })
  },

  clearAllData() {
    wx.showModal({
      title: '确认清空',
      content: '此操作将删除所有本地数据，且无法恢复。确定要继续吗？',
      confirmColor: '#dc2626',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('wardrobeData')
          wx.removeStorageSync('likedIds')
          this.setData({
            clothesCount: 0,
            outfitCount: 0,
            favoriteCount: 0,
            favoritePosts: []
          })
          wx.showToast({ title: '已清空', icon: 'success' })
        }
      }
    })
  },

  exportData() {
    const wardrobeData = wx.getStorageSync('wardrobeData') || []
    if (wardrobeData.length === 0) {
      wx.showToast({ title: '暂无数据可导出', icon: 'none' })
      return
    }
    wx.showModal({
      title: '导出数据',
      content: `共 ${wardrobeData.length} 条衣橱数据`,
      showCancel: false
    })
  }
})

// pages/discover/discover.js
Page({
  data: {
    searchKeyword: '',
    categories: [
      { id: 'all', name: '全部', active: true },
      { id: 'casual', name: '休闲', active: false },
      { id: 'formal', name: '正式', active: false },
      { id: 'sport', name: '运动', active: false },
      { id: 'vintage', name: '复古', active: false }
    ],
    currentCategory: 'all',
    outfitList: []
  },

  onLoad() {
    this.loadOutfitList()
  },

  // 加载穿搭列表
  loadOutfitList() {
    // 模拟数据，实际项目中应从服务器获取
    const mockData = [
      {
        id: '1',
        image: '/images/demo-outfit1.jpg',
        userAvatar: '/images/default-avatar.png',
        username: '时尚达人',
        title: '春季清新穿搭',
        likes: 128,
        comments: 32
      },
      {
        id: '2',
        image: '/images/demo-outfit2.jpg',
        userAvatar: '/images/default-avatar.png',
        username: '穿搭小能手',
        title: '简约风格搭配',
        likes: 256,
        comments: 45
      }
    ]

    // 实际项目中应该调用API
    // wx.request({
    //   url: 'https://your-api.com/outfits',
    //   success: res => {
    //     this.setData({
    //       outfitList: res.data
    //     })
    //   }
    // })

    this.setData({
      outfitList: mockData
    })
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
    // 实际项目中应该调用搜索API
    this.searchOutfits(e.detail.value)
  },

  // 搜索穿搭
  searchOutfits(keyword) {
    // 模拟搜索，实际项目中应调用API
    console.log('搜索关键词:', keyword)
    // 这里可以实现搜索逻辑
  },

  // 切换分类
  switchCategory(e) {
    const categoryId = e.currentTarget.dataset.id
    const categories = this.data.categories.map(item => ({
      ...item,
      active: item.id === categoryId
    }))

    this.setData({
      categories,
      currentCategory: categoryId
    })

    // 重新加载对应分类的数据
    this.loadOutfitList()
  },

  // 查看穿搭详情
  viewOutfitDetail(e) {
    const id = e.currentTarget.dataset.id
    // 实际项目中应该跳转到详情页
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    })
  }
})

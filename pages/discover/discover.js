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
    const mockData = [
      {
        id: '1',
        image: '/images/demo-outfit1.png',
        userAvatar: '/images/default-avatar.png',
        username: '时尚达人',
        title: '春季清新穿搭',
        likes: 128,
        comments: 32
      },
      {
        id: '2',
        image: '/images/demo-outfit2.png',
        userAvatar: '/images/default-avatar.png',
        username: '穿搭小能手',
        title: '简约风格搭配',
        likes: 256,
        comments: 45
      }
    ]

    this.setData({
      outfitList: mockData
    })
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
    this.searchOutfits(e.detail.value)
  },

  // 搜索穿搭
  searchOutfits(keyword) {
    console.log('搜索关键词:', keyword)
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

    this.loadOutfitList()
  },

  // 查看穿搭详情
  viewOutfitDetail() {
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    })
  }
})

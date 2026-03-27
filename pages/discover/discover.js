// pages/discover/discover.js
const dbUtil = require('../../utils/db.js')

// 时间格式化
function formatTime(publishTime) {
  if (!publishTime) return ''
  var ts = typeof publishTime === 'object' && publishTime.$date
    ? publishTime.$date
    : (typeof publishTime === 'number' ? publishTime : new Date(publishTime).getTime())
  var now = Date.now()
  var diff = Math.floor((now - ts) / 1000)
  if (diff < 60) return '刚刚'
  if (diff < 3600) return Math.floor(diff / 60) + '分钟前'
  if (diff < 86400) return Math.floor(diff / 3600) + '小时前'
  if (diff < 86400 * 3) return Math.floor(diff / 86400) + '天前'
  var d = new Date(ts)
  var mm = d.getMonth() + 1
  var dd = d.getDate()
  var hh = d.getHours()
  var min = d.getMinutes()
  return mm + '月' + dd + '日 ' + (hh < 10 ? '0' : '') + hh + ':' + (min < 10 ? '0' : '') + min
}

Page({
  data: {
    styleOptions: ['休闲', '正式', '运动', '复古'],
    searchKeyword: '',
    activeFilter: '',
    outfitList: [],
    filteredList: []
  },

  onLoad() {
    this.loadData()
  },

  onShow() {
    this.loadData()
  },

  loadData() {
    Promise.all([
      dbUtil.getPosts(),
      dbUtil.getMyFavIds()
    ]).then(results => {
      const posts = results[0]
      const favIds = results[1]
      const likedIds = wx.getStorageSync('likedIds') || []
      const decorated = posts.map(p => Object.assign({}, p, {
        id: p._id,
        liked: likedIds.includes(p._id),
        faved: favIds.includes(p._id),
        image: p.imageUrl || p.imageFileID || '',
        timeLabel: formatTime(p.publishTime)
      }))
      this.setData({ outfitList: decorated })
      this.applyFilter(this.data.searchKeyword, this.data.activeFilter, decorated)
      this._refreshImageUrls(decorated)
    }).catch(err => {
      console.error('加载帖子失败', err)
      wx.showToast({ title: '加载失败，请重试', icon: 'none' })
    })
  },

  _refreshImageUrls(posts) {
    const needRefresh = posts.filter(p => p.imageFileID && !p.imageUrl)
    if (needRefresh.length === 0) return
    Promise.all(needRefresh.map(p =>
      dbUtil.getTempUrl(p.imageFileID).then(url => ({ id: p._id, url }))
    )).then(results => {
      const urlMap = {}
      results.forEach(r => { urlMap[r.id] = r.url })
      const updated = this.data.outfitList.map(p =>
        urlMap[p._id] ? Object.assign({}, p, { image: urlMap[p._id] }) : p
      )
      this.setData({ outfitList: updated })
      this.applyFilter(this.data.searchKeyword, this.data.activeFilter, updated)
    })
  },

  // 跳转发布页
  goPublish() {
    wx.navigateTo({ url: '/pages/publishPost/publishPost' })
  },

  // 跳转我发布的帖子
  goMyPosts() {
    wx.navigateTo({ url: '/pages/myPosts/myPosts' })
  },

  onSearchInput(e) {
    const keyword = e.detail.value
    this.setData({ searchKeyword: keyword })
    this.applyFilter(keyword, this.data.activeFilter, this.data.outfitList)
  },

  setFilter(e) {
    const tag = e.currentTarget.dataset.tag
    this.setData({ activeFilter: tag })
    this.applyFilter(this.data.searchKeyword, tag, this.data.outfitList)
  },

  applyFilter(keyword, activeFilter, list) {
    let result = (list || this.data.outfitList).slice()
    if (activeFilter) {
      result = result.filter(item => item.tags && item.tags.includes(activeFilter))
    }
    if (keyword) {
      const kw = keyword.toLowerCase()
      result = result.filter(item => item.desc && item.desc.toLowerCase().includes(kw))
    }
    this.setData({ filteredList: result })
  },

  toggleLike(e) {
    const id = e.currentTarget.dataset.id
    const post = this.data.outfitList.find(p => p._id === id || p.id === id)
    if (!post) return
    const currentLiked = post.liked
    const likedIds = wx.getStorageSync('likedIds') || []
    wx.setStorageSync('likedIds', currentLiked
      ? likedIds.filter(i => i !== id)
      : likedIds.concat([id]))
    const updated = this.data.outfitList.map(p => {
      if (p._id === id || p.id === id) {
        const liked = !p.liked
        return Object.assign({}, p, { liked, likes: liked ? p.likes + 1 : p.likes - 1 })
      }
      return p
    })
    this.setData({ outfitList: updated })
    this.applyFilter(this.data.searchKeyword, this.data.activeFilter, updated)
    dbUtil.toggleLike(id, currentLiked).catch(err => console.error('点赞同步失败', err))
  },

  toggleFav(e) {
    const id = e.currentTarget.dataset.id
    const post = this.data.outfitList.find(p => p._id === id || p.id === id)
    if (!post) return
    const currentFaved = post.faved
    const updated = this.data.outfitList.map(p => {
      if (p._id === id || p.id === id) return Object.assign({}, p, { faved: !p.faved })
      return p
    })
    this.setData({ outfitList: updated })
    this.applyFilter(this.data.searchKeyword, this.data.activeFilter, updated)
    wx.showToast({ title: currentFaved ? '已取消收藏' : '已收藏', icon: 'none' })
    dbUtil.toggleFav(id, currentFaved).catch(err => console.error('收藏同步失败', err))
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/postDetail/postDetail?id=' + id })
  }
})

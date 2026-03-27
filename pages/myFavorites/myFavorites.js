// pages/myFavorites/myFavorites.js
const dbUtil = require('../../utils/db.js')

Page({
  data: {
    postList: [],
    loading: true
  },

  onLoad() {
    this.loadFavorites()
  },

  onShow() {
    this.loadFavorites()
  },

  loadFavorites() {
    this.setData({ loading: true })
    dbUtil.getMyFavIds().then(favIds => {
      if (favIds.length === 0) {
        this.setData({ postList: [], loading: false })
        return
      }
      return dbUtil.getPosts().then(posts => {
        const favPosts = posts
          .filter(p => favIds.includes(p._id))
          .map(p => Object.assign({}, p, {
            id: p._id,
            image: p.imageUrl || p.imageFileID || ''
          }))
        this.setData({ postList: favPosts, loading: false })

        // 批量刷新图片 URL
        const needUrl = favPosts.filter(p => p.imageFileID && !p.imageUrl)
        if (needUrl.length === 0) return
        Promise.all(needUrl.map(p =>
          dbUtil.getTempUrl(p.imageFileID).then(url => ({ id: p._id, url }))
        )).then(results => {
          const urlMap = {}
          results.forEach(r => { urlMap[r.id] = r.url })
          const updated = this.data.postList.map(p =>
            urlMap[p._id] ? Object.assign({}, p, { image: urlMap[p._id] }) : p
          )
          this.setData({ postList: updated })
        })
      })
    }).catch(err => {
      console.error('加载收藏失败', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/postDetail/postDetail?id=' + id })
  }
})

// pages/myPosts/myPosts.js
const dbUtil = require('../../utils/db.js')

Page({
  data: {
    postList: [],
    loading: true
  },

  onLoad() {
    this.loadMyPosts()
  },

  onShow() {
    this.loadMyPosts()
  },

  loadMyPosts() {
    this.setData({ loading: true })
    dbUtil.getPosts().then(posts => {
      // 过滤出自己发布的（云数据库 _openid 自动匹配当前用户）
      // 由于客户端只能查到自己的 _openid 记录，这里拿全部帖子中 _openid 非空的即为本人
      const myPosts = posts.filter(p => p._openid !== undefined && p._openid !== null)
      const decorated = myPosts.map(p => Object.assign({}, p, {
        id: p._id,
        image: p.imageUrl || p.imageFileID || ''
      }))
      this.setData({ postList: decorated, loading: false })

      // 批量刷新图片 URL
      const needUrl = decorated.filter(p => p.imageFileID && !p.imageUrl)
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
    }).catch(err => {
      console.error('加载失败', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/postDetail/postDetail?id=' + id })
  },

  deletePost(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确认删除这条帖子吗？',
      confirmColor: '#dc2626',
      success: (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中...' })
        dbUtil.deletePost(id).then(() => {
          wx.hideLoading()
          wx.showToast({ title: '已删除', icon: 'success' })
          this.loadMyPosts()
        }).catch(err => {
          wx.hideLoading()
          console.error('删除失败', err)
          wx.showToast({ title: '删除失败', icon: 'none' })
        })
      }
    })
  }
})

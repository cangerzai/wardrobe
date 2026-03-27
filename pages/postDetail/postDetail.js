// pages/postDetail/postDetail.js
const dbUtil = require('../../utils/db.js')

// ─── 时间格式化 ───────────────────────────────────────
function formatTime(publishTime) {
  if (!publishTime) return ''
  // publishTime 可能是时间戳数字或云数据库 Date 对象
  var ts = typeof publishTime === 'object' && publishTime.$date
    ? publishTime.$date
    : (typeof publishTime === 'number' ? publishTime : new Date(publishTime).getTime())
  var now = Date.now()
  var diff = Math.floor((now - ts) / 1000) // 秒差
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
    postId: '',
    post: null,
    commentList: [],
    commentText: '',
    myOpenid: ''
  },

  onLoad(options) {
    const id = options.id
    this.setData({ postId: id })
    // 先拿 openid，再加载帖子
    this._getOpenid().then(() => this.loadPost(id))
  },

  onShow() {
    if (this.data.postId) {
      this.loadPost(this.data.postId)
    }
  },

  // 获取当前用户 openid（用于判断评论是否属于自己）
  _getOpenid() {
    if (this.data.myOpenid) return Promise.resolve()
    return wx.cloud.callFunction({ name: 'getOpenid' })
      .then(res => {
        const openid = res.result && (res.result.openid || res.result.OPENID || '')
        this.setData({ myOpenid: openid })
      })
      .catch(() => {
        // 若未部署 getOpenid 云函数，用本地缓存降级
        const cached = wx.getStorageSync('myOpenid') || ''
        this.setData({ myOpenid: cached })
      })
  },

  loadPost(id) {
    wx.showLoading({ title: '加载中...' })
    Promise.all([
      dbUtil.getPost(id),
      dbUtil.getComments(id),
      dbUtil.getMyFavIds()
    ]).then(results => {
      wx.hideLoading()
      const post = results[0]
      const comments = results[1]
      const favIds = results[2]
      if (!post) {
        wx.showToast({ title: '帖子不存在', icon: 'none' })
        return
      }
      const likedIds = wx.getStorageSync('likedIds') || []
      const myOpenid = this.data.myOpenid
      const decorated = Object.assign({}, post, {
        id: post._id,
        liked: likedIds.includes(post._id),
        faved: favIds.includes(post._id),
        image: post.imageUrl || post.imageFileID || '',
        timeLabel: formatTime(post.publishTime)
      })
      // 给每条评论打上 isMine 标记 + 格式化时间
      const decoratedComments = comments.map(c => Object.assign({}, c, {
        isMine: myOpenid && c._openid === myOpenid,
        timeLabel: formatTime(c.publishTime)
      }))
      this.setData({ post: decorated, commentList: decoratedComments })
      wx.setNavigationBarTitle({ title: '穿搭详情' })

      if (post.imageFileID && !post.imageUrl) {
        dbUtil.getTempUrl(post.imageFileID).then(url => {
          this.setData({ 'post.image': url })
        })
      }
    }).catch(err => {
      wx.hideLoading()
      console.error('加载帖子失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  // 点赞
  toggleLike() {
    const post = this.data.post
    if (!post) return
    const id = post._id
    const currentLiked = post.liked
    const likedIds = wx.getStorageSync('likedIds') || []
    wx.setStorageSync('likedIds', currentLiked
      ? likedIds.filter(i => i !== id)
      : likedIds.concat([id]))
    this.setData({
      'post.liked': !currentLiked,
      'post.likes': currentLiked ? post.likes - 1 : post.likes + 1
    })
    dbUtil.toggleLike(id, currentLiked).catch(err => console.error('点赞同步失败', err))
  },

  // 收藏
  toggleFav() {
    const post = this.data.post
    if (!post) return
    const id = post._id
    const currentFaved = post.faved
    this.setData({ 'post.faved': !currentFaved })
    wx.showToast({ title: currentFaved ? '已取消收藏' : '已收藏', icon: 'none' })
    dbUtil.toggleFav(id, currentFaved).catch(err => console.error('收藏同步失败', err))
  },

  onCommentInput(e) {
    this.setData({ commentText: e.detail.value })
  },

  // 发送评论
  submitComment() {
    const text = (this.data.commentText || '').trim()
    if (!text) {
      wx.showToast({ title: '评论不能为空', icon: 'none' })
      return
    }
    const postId = this.data.postId
    const now = Date.now()
    dbUtil.addComment(postId, text, now).then(res => {
      const newComment = {
        _id: res._id,
        _openid: this.data.myOpenid,
        postId,
        text,
        timeLabel: '刚刚',
        publishTime: now,
        isMine: true
      }
      this.setData({
        commentList: this.data.commentList.concat([newComment]),
        commentText: '',
        'post.comments': (this.data.post.comments || 0) + 1
      })
      wx.showToast({ title: '评论成功', icon: 'success' })
    }).catch(err => {
      console.error('评论失败', err)
      wx.showToast({ title: '评论失败，请重试', icon: 'none' })
    })
  },

  // 删除自己的评论
  deleteComment(e) {
    const commentId = e.currentTarget.dataset.commentId
    wx.showModal({
      title: '删除评论',
      content: '确认删除这条评论吗？',
      confirmColor: '#dc2626',
      success: (res) => {
        if (!res.confirm) return
        dbUtil.deleteComment(this.data.postId, commentId).then(() => {
          this.setData({
            commentList: this.data.commentList.filter(c => c._id !== commentId),
            'post.comments': Math.max(0, (this.data.post.comments || 1) - 1)
          })
          wx.showToast({ title: '已删除', icon: 'success' })
        }).catch(err => {
          console.error('删除评论失败', err)
          wx.showToast({ title: '删除失败', icon: 'none' })
        })
      }
    })
  }
})

// pages/publishPost/publishPost.js
const dbUtil = require('../../utils/db.js')

Page({
  data: {
    styleOptions: ['休闲', '正式', '运动', '复古'],
    publishImage: '',
    publishDesc: '',
    publishTags: [],
    isPublishing: false
  },

  choosePublishImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({ publishImage: res.tempFilePaths[0] })
      },
      fail: () => {}
    })
  },

  onDescInput(e) {
    this.setData({ publishDesc: e.detail.value })
  },

  toggleTag(e) {
    const tag = e.currentTarget.dataset.tag
    if (!tag) return
    let tags = this.data.publishTags.slice()
    const idx = tags.indexOf(tag)
    if (idx >= 0) {
      tags.splice(idx, 1)
    } else {
      if (tags.length >= 2) {
        wx.showToast({ title: '最多选 2 个风格标签', icon: 'none' })
        return
      }
      tags.push(tag)
    }
    this.setData({ publishTags: tags })
  },

  publishOutfit() {
    if (!this.data.publishImage) {
      wx.showToast({ title: '请先上传穿搭图片', icon: 'none' })
      return
    }
    if (!this.data.publishDesc.trim()) {
      wx.showToast({ title: '请填写灵感说明', icon: 'none' })
      return
    }
    this.setData({ isPublishing: true })
    wx.showLoading({ title: '发布中...', mask: true })

    dbUtil.publishPost({
      imageTempPath: this.data.publishImage,
      desc: this.data.publishDesc.trim(),
      tags: this.data.publishTags
    }).then(() => {
      wx.hideLoading()
      wx.showToast({ title: '发布成功', icon: 'success' })
      this.setData({ publishImage: '', publishDesc: '', publishTags: [], isPublishing: false })
      setTimeout(() => {
        wx.navigateBack()
      }, 1200)
    }).catch(err => {
      wx.hideLoading()
      console.error('发布失败', err)
      this.setData({ isPublishing: false })
      wx.showToast({ title: '发布失败，请重试', icon: 'none' })
    })
  }
})

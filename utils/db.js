// utils/db.js
// 云数据库统一操作封装

function db() {
  return wx.cloud.database()
}

function serverDate() {
  return wx.cloud.database().serverDate()
}

function inc(n) {
  return wx.cloud.database().command.inc(n)
}

// ─── 帖子 ───────────────────────────────────────────

function getPosts(options) {
  options = options || {}
  return new Promise(function(resolve, reject) {
    db().collection('posts')
      .orderBy('publishTime', 'desc')
      .limit(50)
      .get()
      .then(function(res) {
        var list = res.data || []
        if (options.tag) {
          list = list.filter(function(p) { return p.tags && p.tags.includes(options.tag) })
        }
        if (options.keyword) {
          var kw = options.keyword.toLowerCase()
          list = list.filter(function(p) { return p.desc && p.desc.toLowerCase().includes(kw) })
        }
        resolve(list)
      })
      .catch(reject)
  })
}

function getPost(postId) {
  return db().collection('posts').doc(postId).get().then(function(res) { return res.data })
}

function publishPost(post) {
  return new Promise(function(resolve, reject) {
    var cloudPath = 'discover/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.jpg'
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: post.imageTempPath,
      success: function(uploadRes) {
        _addPost(uploadRes.fileID, '', post, resolve, reject)
      },
      fail: function(err) {
        console.warn('云存储上传失败，降级用本地路径', err)
        _addPost('', post.imageTempPath, post, resolve, reject)
      }
    })
  })
}

function _addPost(fileID, imageUrl, post, resolve, reject) {
  db().collection('posts').add({
    data: {
      imageFileID: fileID,
      imageUrl: imageUrl,
      desc: post.desc,
      tags: post.tags || [],
      likes: 0,
      comments: 0,
      publishTime: serverDate(),
      timeLabel: '刚刚'
    }
  }).then(function(addRes) {
    resolve({ _id: addRes._id, imageFileID: fileID })
  }).catch(reject)
}

function deletePost(postId) {
  return db().collection('posts').doc(postId).remove().then(function() {
    return db().collection('comments').where({ postId: postId }).remove()
  })
}

// ─── 点赞 ───────────────────────────────────────────

function toggleLike(postId, currentLiked) {
  return wx.cloud.callFunction({
    name: 'toggleLike',
    data: { postId: postId, action: currentLiked ? 'unlike' : 'like' }
  }).then(function(res) { return res.result })
}

// ─── 收藏 ───────────────────────────────────────────

function toggleFav(postId, currentFaved) {
  if (currentFaved) {
    return db().collection('favorites')
      .where({ postId: postId })
      .remove()
      .then(function() { return { faved: false } })
  } else {
    return db().collection('favorites')
      .add({ data: { postId: postId, addTime: serverDate() } })
      .then(function() { return { faved: true } })
  }
}

function getMyFavIds() {
  return db().collection('favorites')
    .orderBy('addTime', 'desc')
    .get()
    .then(function(res) {
      return (res.data || []).map(function(f) { return f.postId })
    })
}

// ─── 评论 ───────────────────────────────────────────

function getComments(postId) {
  return db().collection('comments')
    .where({ postId: postId })
    .orderBy('publishTime', 'asc')
    .get()
    .then(function(res) { return res.data || [] })
}

// publishTime 传入客户端时间戳，避免 serverDate 异步导致排序错乱
function addComment(postId, text, publishTime) {
  return db().collection('comments').add({
    data: {
      postId: postId,
      text: text,
      publishTime: publishTime ? new Date(publishTime) : serverDate()
    }
  }).then(function(addRes) {
    db().collection('posts').doc(postId).update({
      data: { comments: inc(1) }
    })
    return { _id: addRes._id }
  })
}

function deleteComment(postId, commentId) {
  return db().collection('comments').doc(commentId).remove().then(function() {
    db().collection('posts').doc(postId).update({
      data: { comments: inc(-1) }
    })
  })
}

function getTempUrl(fileID) {
  if (!fileID) return Promise.resolve('')
  return new Promise(function(resolve, reject) {
    wx.cloud.getTempFileURL({
      fileList: [{ fileID: fileID }],
      success: function(res) {
        var url = res.fileList && res.fileList[0] && res.fileList[0].tempFileURL
        resolve(url || '')
      },
      fail: reject
    })
  })
}

module.exports = {
  getPosts: getPosts,
  getPost: getPost,
  publishPost: publishPost,
  deletePost: deletePost,
  toggleLike: toggleLike,
  toggleFav: toggleFav,
  getMyFavIds: getMyFavIds,
  getComments: getComments,
  addComment: addComment,
  deleteComment: deleteComment,
  getTempUrl: getTempUrl
}

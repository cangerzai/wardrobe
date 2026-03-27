const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { postId, action } = event
  const { OPENID } = cloud.getWXContext()

  if (!postId || !action) {
    return { success: false, error: '缺少参数' }
  }

  try {
    if (action === 'like') {
      // 检查是否已点赞（防重复）
      const exist = await db.collection('likes').where({ postId, _openid: OPENID }).count()
      if (exist.total > 0) return { success: true, liked: true }

      await db.collection('likes').add({ data: { postId } })
      await db.collection('posts').doc(postId).update({
        data: { likes: _.inc(1) }
      })
      return { success: true, liked: true }
    } else {
      // unlike
      await db.collection('likes').where({ postId, _openid: OPENID }).remove()
      await db.collection('posts').doc(postId).update({
        data: { likes: _.inc(-1) }
      })
      return { success: true, liked: false }
    }
  } catch (e) {
    return { success: false, error: e.message || String(e) }
  }
}

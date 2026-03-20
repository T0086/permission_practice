const express = require('express')
const jwt = require('jsonwebtoken')
const cors = require('cors')
const bcrypt = require('bcrypt')
const app = express()

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const SECRET_KEY = 'your_secret_key_123'
const saltRounds = 10
const users = []

// ====================== 等级映射（正确）
const ROLE_LEVEL_MAP = {
  'admin': 0,
  'worker': 1,
  'customer': 2
}

// ====================== 权限中间件（修复完成）
const checkPermission = (minLevel = 2) => {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ code: 401, msg: '未登录' })

    try {
      const decoded = jwt.verify(token, SECRET_KEY)
      req.user = decoded

      // 永远通过角色计算等级，不依赖 token 里的 level
      const roleLower = (decoded.role || '').toLowerCase()
      const userLevel = ROLE_LEVEL_MAP[roleLower] ?? 2

      if (userLevel > minLevel) {
        return res.status(403).json({
          code: 403,
          msg: `无权限（需要≤${minLevel}，你是${userLevel}）`
        })
      }
      next()
    } catch (err) {
      return res.status(401).json({ code: 401, msg: 'Token无效' })
    }
  }
}

// ====================== 检查用户名
app.get('/api/checkUsername', (req, res) => {
  const { usrname } = req.query
  if (!usrname) return res.status(400).json({ msg: '用户名不能为空' })
  const exist = users.some(u => u.usrname === usrname)
  if (exist) return res.status(400).json({ msg: '用户名已存在' })
  res.json({ msg: '用户名可用' })
})

// ====================== 注册
app.post('/api/register', async (req, res) => {
  const { usrname, password, role } = req.body
  if (!usrname || !password || !role) return res.status(400).json({ msg: '不能为空' })

  const roleLower = role.toLowerCase()
  if (!ROLE_LEVEL_MAP.hasOwnProperty(roleLower)) {
    return res.status(400).json({ msg: '角色只能是 admin/worker/customer' })
  }

  const exist = users.some(u => u.usrname === usrname.trim())
  if (exist) return res.status(400).json({ msg: '用户名已存在' })

  const hashedPwd = await bcrypt.hash(password, saltRounds)
  users.push({
    usrname: usrname.trim(),
    password: hashedPwd,
    role: roleLower,
    level: ROLE_LEVEL_MAP[roleLower]
  })
  res.json({ code: 200, msg: '注册成功' })
})

// ====================== 登录
app.post('/api/login', async (req, res) => {
  const { usrname, password } = req.body
  if (!usrname || !password) return res.status(400).json({ msg: '不能为空' })

  const user = users.find(u => u.usrname === usrname.trim())
  if (!user) return res.status(400).json({ msg: '用户不存在' })

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) return res.status(400).json({ msg: '密码错误' })

  const token = jwt.sign(
    { usrname: user.usrname, role: user.role, level: user.level },
    SECRET_KEY,
    { expiresIn: '2h' }
  )
  res.json({
    code: 200,
    data: { token, user: { usrname: user.usrname, role: user.role, level: user.level } }
  })
})

// ====================== 个人信息
app.get('/api/profile', checkPermission(2), (req, res) => {
  res.json({ code: 200, data: req.user })
})

// ====================== 用户列表（admin/worker 可访问）
app.get('/api/users', checkPermission(1), (req, res) => {
  const list = users.map(u => ({
    usrname: u.usrname,
    role: u.role,
    level: u.level
  }))
  res.json({ code: 200, data: list })
})

// ====================== 删除用户（最终修复版）
app.delete('/api/users/:usrname', checkPermission(1), (req, res) => {
  const { usrname } = req.params
  const currentUser = req.user

  // 1. 查找目标用户
  const targetUser = users.find(u => u.usrname === usrname)
  if (!targetUser) return res.status(400).json({ msg: '用户不存在' })

  // 2. 通过角色重新计算当前用户等级（不依赖token）
  const currentRole = (currentUser.role || '').toLowerCase()
  const currentLevel = ROLE_LEVEL_MAP[currentRole] ?? 2
  const targetLevel = targetUser.level

  // 3. 不能删除权限更高的人
  if (targetLevel < currentLevel) {
    return res.status(403).json({ msg: '不能删除权限比你高的用户' })
  }

  // 4. 不能删除自己
  if (currentUser.usrname === usrname) {
    return res.status(400).json({ msg: '不能删除自己' })
  }

  const idx = users.findIndex(u => u.usrname === usrname)
  users.splice(idx, 1)
  res.json({ code: 200, msg: '删除成功' })
})

const PORT = 8081
app.listen(PORT, () => {
  console.log(`服务已启动：http://localhost:${PORT}`)
})
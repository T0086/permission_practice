const express = require('express')
const jwt = require('jsonwebtoken')
const cors = require('cors')
const bcrypt = require('bcrypt')
const mysql = require('mysql2/promise')

const app = express()

// 👇 数据库连接配置（改成你自己的MySQL密码！）
const dbConfig = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '123456', // 必须和Navicat登录密码一致
  database: 'user_manage_sys', // 必须是这个名字
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
}

// 创建数据库连接池
const pool = mysql.createPool(dbConfig)

// 测试数据库连接
;(async () => {
  try {
    const conn = await pool.getConnection() // 去掉数组解构
    console.log('✅ MySQL数据库连接成功！')
    conn.release()
  } catch (err) {
    console.error('❌ MySQL连接失败：', err.message)
  }
})()

// 中间件配置
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const SECRET_KEY = 'your_secret_key_123'
const saltRounds = 10
const ROLE_LEVEL_MAP = {
  'admin': 0,
  'worker': 1,
  'customer': 2
}

// 权限校验中间件（保留原逻辑）
function checkPermission(minLevel) {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ msg: '未登录' })
    try {
      const decoded = jwt.verify(token, SECRET_KEY)
      req.user = decoded
      if (decoded.level > minLevel) {
        return res.status(403).json({ msg: '权限不足' })
      }
      next()
    } catch (err) {
      return res.status(401).json({ msg: 'token无效' })
    }
  }
}

// 1. 检查用户名是否存在
app.get('/api/checkUsername', async (req, res) => {
  const { usrname } = req.query
  if (!usrname) return res.status(400).json({ msg: '用户名不能为空' })
  try {
    const [rows] = await pool.execute('SELECT usrname FROM users WHERE usrname = ?', [usrname.trim()])
    if (rows.length > 0) return res.status(400).json({ msg: '用户名已存在' })
    res.json({ msg: '用户名可用' })
  } catch (err) {
    console.error('检查用户名失败：', err)
    res.status(500).json({ msg: '服务器数据库错误' })
  }
})

// 2. 注册接口
app.post('/api/register', async (req, res) => {
  const { usrname, password, role } = req.body
  if (!usrname || !password || !role) return res.status(400).json({ msg: '不能为空' })
  const roleLower = role.toLowerCase()
  if (!ROLE_LEVEL_MAP.hasOwnProperty(roleLower)) {
    return res.status(400).json({ msg: '角色只能是 admin/worker/customer' })
  }
  const usernameTrim = usrname.trim()
  try {
    const [existUser] = await pool.execute('SELECT usrname FROM users WHERE usrname = ?', [usernameTrim])
    if (existUser.length > 0) return res.status(400).json({ msg: '用户名已存在' })
    const hashedPwd = await bcrypt.hash(password, saltRounds)
    const userLevel = ROLE_LEVEL_MAP[roleLower]
    await pool.execute(
      'INSERT INTO users (usrname, password, role, level) VALUES (?, ?, ?, ?)',
      [usernameTrim, hashedPwd, roleLower, userLevel]
    )
    res.json({ code: 200, msg: '注册成功' })
  } catch (err) {
    console.error('注册失败：', err)
    res.status(500).json({ msg: '服务器数据库错误' })
  }
})

// 3. 登录接口
app.post('/api/login', async (req, res) => {
  const { usrname, password } = req.body
  if (!usrname || !password) return res.status(400).json({ msg: '不能为空' })
  const usernameTrim = usrname.trim()
  try {
    const [userList] = await pool.execute('SELECT * FROM users WHERE usrname = ?', [usernameTrim])
    if (userList.length === 0) return res.status(400).json({ msg: '用户不存在' })
    const user = userList[0]
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
  } catch (err) {
    console.error('登录失败：', err)
    res.status(500).json({ msg: '服务器数据库错误' })
  }
})

// 4. 获取个人信息
app.get('/api/profile', checkPermission(2), (req, res) => {
  res.json({ code: 200, data: req.user })
})

// 5. 获取用户列表（需要至少worker权限）
app.get('/api/users', checkPermission(1), async (req, res) => {
  try {
    const [userList] = await pool.execute('SELECT usrname, role, level FROM users')
    res.json({ code: 200, data: userList })
  } catch (err) {
    console.error('获取用户列表失败：', err)
    res.status(500).json({ msg: '服务器数据库错误' })
  }
})

// 6. 删除用户（需要至少worker权限）
app.delete('/api/users/:usrname', checkPermission(1), async (req, res) => {
  const { usrname } = req.params
  const currentUser = req.user
  try {
    const [targetList] = await pool.execute('SELECT * FROM users WHERE usrname = ?', [usrname])
    if (targetList.length === 0) return res.status(400).json({ msg: '用户不存在' })
    const targetUser = targetList[0]
    const currentRole = (currentUser.role || '').toLowerCase()
    const currentLevel = ROLE_LEVEL_MAP[currentRole] ?? 2
    const targetLevel = targetUser.level
    if (targetLevel < currentLevel) {
      return res.status(403).json({ msg: '不能删除权限比你高的用户' })
    }
    if (currentUser.usrname === usrname) {
      return res.status(400).json({ msg: '不能删除自己' })
    }
    await pool.execute('DELETE FROM users WHERE usrname = ?', [usrname])
    res.json({ code: 200, msg: '删除成功' })
  } catch (err) {
    console.error('删除用户失败：', err)
    res.status(500).json({ msg: '服务器数据库错误' })
  }
})
// 修改密码接口（需要登录权限）
app.put('/api/changePassword', checkPermission(2), async (req, res) => {
  const { oldPassword, newPassword } = req.body
  const currentUser = req.user // 从token获取当前登录用户

  // 前端校验后，后端再做一层校验
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ msg: '旧密码和新密码不能为空' })
  }

  try {
    // 1. 从数据库查询当前用户的加密密码
    const [userList] = await pool.execute(
      'SELECT password FROM users WHERE usrname = ?',
      [currentUser.usrname]
    )
    if (userList.length === 0) {
      return res.status(400).json({ msg: '用户不存在' })
    }
    const user = userList[0]

    // 2. 验证旧密码是否正确（bcrypt对比明文和密文）
    const isOldPwdValid = await bcrypt.compare(oldPassword, user.password)
    if (!isOldPwdValid) {
      return res.status(400).json({ msg: '旧密码错误' })
    }

    // 3. 加密新密码
    const hashedNewPwd = await bcrypt.hash(newPassword, saltRounds)

    // 4. 执行SQL更新数据库密码
    await pool.execute(
      'UPDATE users SET password = ? WHERE usrname = ?',
      [hashedNewPwd, currentUser.usrname]
    )

    res.json({ code: 200, msg: '密码修改成功' })
  } catch (err) {
    console.error('修改密码失败：', err)
    res.status(500).json({ msg: '服务器数据库错误' })
  }
})
// 启动服务
const PORT = 8081
app.listen(PORT, () => {
  console.log(`服务已启动：http://localhost:${PORT}`)
})
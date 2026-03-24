const express = require('express')
const jwt = require('jsonwebtoken')
const cors = require('cors')
const bcrypt = require('bcrypt')
const mysql = require('mysql2/promise')

const app = express()

// 数据库连接配置
const dbConfig = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '123456',
  database: 'user_manage_sys',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
}

// 创建连接池
const pool = mysql.createPool(dbConfig)

// 测试数据库连接
;(async () => {
  try {
    const conn = await pool.getConnection()
    console.log('✅ MySQL数据库连接成功！')
    conn.release()
  } catch (err) {
    console.error('❌ MySQL连接失败：', err.message)
  }
})()

// 中间件
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const SECRET_KEY = 'your_secret_key_123'
const saltRounds = 10

const ROLE_LEVEL_MAP = {
  admin: 0,
  worker: 1,
  customer: 2
}

// 权限中间件
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

// 1. 检查用户名
app.get('/api/checkUsername', async (req, res) => {
  const { usrname } = req.query
  if (!usrname) return res.status(400).json({ msg: '用户名不能为空' })
  try {
    const [rows] = await pool.execute('SELECT usrname FROM users WHERE usrname = ?', [usrname.trim()])
    if (rows.length > 0) return res.status(400).json({ msg: '用户名已存在' })
    res.json({ msg: '用户名可用' })
  } catch (err) {
    console.error('检查用户名失败:', err)
    res.status(500).json({ msg: '服务器错误' })
  }
})

// 2. 注册
// 注册接口（修复版）
app.post('/api/register', async (req, res) => {
  const { usrname, password, role } = req.body
  if (!usrname || !password || !role) return res.status(400).json({ msg: '不能为空' })
  const roleLower = role.toLowerCase()
  if (!ROLE_LEVEL_MAP.hasOwnProperty(roleLower)) {
    return res.status(400).json({ msg: '角色只能是 admin/worker/customer' })
  }
  try {
    const [exist] = await pool.execute('SELECT usrname FROM users WHERE usrname = ?', [usrname.trim()])
    if (exist.length) return res.status(400).json({ msg: '用户名已存在' })
    const hashPwd = await bcrypt.hash(password, saltRounds)
    // ✅ 关键修复：加入 menu_permission 字段，给默认菜单
    await pool.execute(
      'INSERT INTO users (usrname, password, role, level, menu_permission) VALUES (?, ?, ?, ?, ?)',
      [
        usrname.trim(),
        hashPwd,
        roleLower,
        ROLE_LEVEL_MAP[roleLower],
        '["home","profile","changePwd"]' // 默认菜单
      ]
    )
    res.json({ code: 200, msg: '注册成功' })
  } catch (err) {
    console.error('注册失败:', err) // 看后端终端日志，定位具体错误
    res.status(500).json({ msg: '服务器错误：' + err.message })
  }
})

// 3. 登录
app.post('/api/login', async (req, res) => {
  const { usrname, password } = req.body
  if (!usrname || !password) return res.status(400).json({ msg: '不能为空' })
  try {
    const [userList] = await pool.execute('SELECT * FROM users WHERE usrname = ?', [usrname.trim()])
    if (!userList.length) return res.status(400).json({ msg: '用户不存在' })
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
    res.status(500).json({ msg: '服务器错误' })
  }
})

// 4. 个人信息
app.get('/api/profile', checkPermission(2), (req, res) => {
  res.json({ code: 200, data: req.user })
})

// 5. 用户列表
app.get('/api/users', checkPermission(1), async (req, res) => {
  try {
    const [list] = await pool.execute('SELECT usrname, role, level, menu_permission FROM users')
    res.json({ code: 200, data: list })
  } catch (err) {
    res.status(500).json({ msg: '服务器错误' })
  }
})

// ====================== ✅ 修正菜单接口（前端匹配）======================
app.get('/api/user/menus', checkPermission(2), async (req, res) => {
  try {
    const usrname = req.user?.usrname
    if (!usrname) {
      return res.status(401).json({ msg: '用户信息无效' })
    }

    const [rows] = await pool.execute(
      'SELECT menu_permission FROM users WHERE usrname = ?',
      [usrname]
    )

    if (rows.length === 0) {
      return res.status(400).json({ msg: '用户不存在' })
    }

    let menus = rows[0].menu_permission
    let menuArray = []

    if (menus) {
      try {
        menuArray = JSON.parse(menus)
      } catch (parseErr) {
        // 如果解析失败，用默认菜单兜底
        menuArray = ['home', 'profile', 'changePwd']
      }
    } else {
      // 空值用默认菜单
      menuArray = ['home', 'profile', 'changePwd']
    }

    res.json({ code: 200, data: menuArray })
  } catch (err) {
    console.error('获取菜单失败:', err) // 后端打印错误，方便排查
    res.status(500).json({ msg: '服务器错误：' + err.message })
  }
})

// ====================== ✅ 修正设置菜单接口（前端匹配）======================
// 替换原来的 /api/admin/setMenu 接口
app.post('/api/admin/setMenu', checkPermission(0), async (req, res) => {
  const { username, menus } = req.body; // menus是前端传的编号数组[1,2,4]
  try {
    // 核心：编号数组转name数组（和MENU_CONFIG匹配）
    const menuNameMap = {
      1: 'home',
      2: 'profile',
      3: 'userList',
      4: 'changePwd'
    };
    const menuNames = menus.map(num => menuNameMap[num]).filter(Boolean); // 转成["home","profile"]
    
    await pool.execute(
      'UPDATE users SET menu_permission = ? WHERE usrname = ?',
      [JSON.stringify(menuNames), username] // 存name数组，和注册默认值格式一致
    );
    res.json({ code: 200, msg: '保存成功' });
  } catch (e) {
    console.error('保存菜单失败：', e);
    res.status(500).json({ msg: '保存失败' });
  }
});
// ======================================================================

// 6. 删除用户
app.delete('/api/users/:usrname', checkPermission(1), async (req, res) => {
  const { usrname } = req.params
  const currentUser = req.user

  try {
    // 1. 查询目标用户
    const [targetList] = await pool.execute('SELECT level FROM users WHERE usrname = ?', [usrname])
    if (targetList.length === 0) {
      return res.status(400).json({ msg: '用户不存在' })
    }
    const targetLevel = targetList[0].level

    // 2. 权限校验
    if (usrname === currentUser.usrname) {
      return res.status(400).json({ msg: '不能删除自己' })
    }
    if (targetLevel <= currentUser.level) {
      return res.status(403).json({ msg: '不能删除权限等级不低于自己的用户' })
    }

    // 3. 执行删除
    await pool.execute('DELETE FROM users WHERE usrname = ?', [usrname])
    res.json({ code: 200, msg: '删除成功' })
  } catch (err) {
    console.error('删除用户失败:', err)
    res.status(500).json({ msg: '服务器错误' })
  }
})

// 修改密码
app.put('/api/changePassword', checkPermission(2), async (req, res) => {
  const { oldPassword, newPassword } = req.body
  const user = req.user
  if (!oldPassword || !newPassword) return res.status(400).json({ msg: '不能为空' })
  try {
    const [rows] = await pool.execute('SELECT password FROM users WHERE usrname = ?', [user.usrname])
    if (!rows.length) return res.status(400).json({ msg: '用户不存在' })
    const valid = await bcrypt.compare(oldPassword, rows[0].password)
    if (!valid) return res.status(400).json({ msg: '旧密码错误' })
    const newHash = await bcrypt.hash(newPassword, saltRounds)
    await pool.execute('UPDATE users SET password = ? WHERE usrname = ?', [newHash, user.usrname])
    res.json({ code: 200, msg: '修改成功' })
  } catch (err) {
    res.status(500).json({ msg: '服务器错误' })
  }
})

// 启动
const PORT = 8081
app.listen(PORT, () => {
  console.log(`✅ 服务已启动：http://localhost:${PORT}`)
})
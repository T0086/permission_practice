const express = require('express')
const jwt = require('jsonwebtoken')
const cors = require('cors')
const bcrypt = require('bcrypt')
const Redis = require('ioredis')

const app = express()

// Redis 连接配置
const redisConfig = {
  host: 'localhost',
  port: 6379,
  password: '',
  db: 0,
  keyPrefix: 'user_manage:'
}

// 创建 Redis 客户端
const redisClient = new Redis(redisConfig)

// 测试 Redis 连接
redisClient.ping((err, pong) => {
  if (err) {
    console.error('❌ Redis 连接失败：', err.message)
    return
  }
  console.log('✅ Redis 连接成功！', pong)
})

// 中间件
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 密钥配置（建议生产环境用环境变量）
const SECRET_KEY = 'your_secret_key_123'          // 访问令牌密钥
const REFRESH_SECRET_KEY = 'your_refresh_secret_key_456' // 刷新令牌密钥
const saltRounds = 10

// 角色等级映射
const ROLE_LEVEL_MAP = {
  admin: 0,
  worker: 1,
  customer: 2
}

// ===================== 核心：权限中间件 =====================
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
      return res.status(401).json({ msg: 'token无效/已过期' })
    }
  }
}

// ===================== 1. 检查用户名 =====================
app.get('/api/checkUsername', async (req, res) => {
  const { usrname } = req.query
  if (!usrname) return res.status(400).json({ msg: '用户名不能为空' })
  const username = usrname.trim()
  try {
    const exists = await redisClient.sismember('all:usernames', username)
    if (exists) return res.status(400).json({ msg: '用户名已存在' })
    res.json({ msg: '用户名可用' })
  } catch (err) {
    console.error('检查用户名失败:', err)
    res.status(500).json({ msg: '服务器错误' })
  }
})

// ===================== 2. 注册 =====================
app.post('/api/register', async (req, res) => {
  const { usrname, password, role } = req.body
  if (!usrname || !password || !role) return res.status(400).json({ msg: '不能为空' })
  const roleLower = role.toLowerCase()
  if (!ROLE_LEVEL_MAP.hasOwnProperty(roleLower)) {
    return res.status(400).json({ msg: '角色只能是 admin/worker/customer' })
  }
  const username = usrname.trim()
  try {
    const exists = await redisClient.sismember('all:usernames', username)
    if (exists) return res.status(400).json({ msg: '用户名已存在' })
    
    const hashPwd = await bcrypt.hash(password, saltRounds)
    await redisClient.hmset(
      `user:${username}`,
      'password', hashPwd,
      'role', roleLower,
      'level', ROLE_LEVEL_MAP[roleLower],
      'menu_permission', JSON.stringify(['home','profile','changePwd'])
    )
    await redisClient.sadd('all:usernames', username)
    res.json({ code: 200, msg: '注册成功' })
  } catch (err) {
    console.error('注册失败:', err)
    res.status(500).json({ msg: '服务器错误：' + err.message })
  }
})

// ===================== 3. 登录（核心：生成长短Token） =====================
app.post('/api/login', async (req, res) => {
  const { usrname, password } = req.body
  if (!usrname || !password) return res.status(400).json({ msg: '不能为空' })
  const username = usrname.trim()
  try {
    const user = await redisClient.hgetall(`user:${username}`)
    if (Object.keys(user).length === 0) return res.status(400).json({ msg: '用户不存在' })
    
    const valid = await bcrypt.compare(password, user.password)
    if (!valid) return res.status(400).json({ msg: '密码错误' })
    
    // 生成访问令牌（短Token，2小时过期）
    const accessToken = jwt.sign(
      { usrname: username, role: user.role, level: parseInt(user.level) },
      SECRET_KEY,
      { expiresIn: '2h' }
    )
    
    // 生成刷新令牌（长Token，7天过期）
    const refreshToken = jwt.sign(
      { usrname: username, role: user.role },
      REFRESH_SECRET_KEY,
      { expiresIn: '7d' }
    )
    
    // 刷新令牌存入Redis（用于校验和注销）
    await redisClient.set(
      `refresh_token:${username}`,
      refreshToken,
      'EX',
      7 * 24 * 60 * 60 // 7天过期
    )
    
    res.json({
      code: 200,
      data: { 
        accessToken,  // 短Token：接口请求用
        refreshToken, // 长Token：刷新短Token用
        user: { usrname: username, role: user.role, level: parseInt(user.level) } 
      }
    })
  } catch (err) {
    res.status(500).json({ msg: '服务器错误' })
  }
})

// ===================== 4. 刷新Token（核心：长Token换短Token） =====================
app.post('/api/refreshToken', async (req, res) => {
  const { refreshToken } = req.body
  if (!refreshToken) return res.status(400).json({ msg: '刷新令牌不能为空' })

  try {
    // 验证刷新令牌有效性
    const decoded = jwt.verify(refreshToken, REFRESH_SECRET_KEY)
    const username = decoded.usrname

    // 校验Redis中的刷新令牌是否一致（防止伪造/已注销）
    const storedRefreshToken = await redisClient.get(`refresh_token:${username}`)
    if (storedRefreshToken !== refreshToken) {
      return res.status(401).json({ msg: '刷新令牌无效/已失效' })
    }

    // 获取用户最新信息
    const user = await redisClient.hgetall(`user:${username}`)
    if (Object.keys(user).length === 0) {
      return res.status(400).json({ msg: '用户不存在' })
    }

    // 生成新的访问令牌
    const newAccessToken = jwt.sign(
      { usrname: username, role: user.role, level: parseInt(user.level) },
      SECRET_KEY,
      { expiresIn: '2h' }
    )

    res.json({
      code: 200,
      data: { accessToken: newAccessToken }
    })
  } catch (err) {
    console.error('刷新token失败:', err)
    res.status(401).json({ msg: '刷新令牌过期/无效' })
  }
})

// ===================== 5. 退出登录（清除刷新Token） =====================
app.post('/api/logout', async (req, res) => {
  const { username } = req.body
  if (!username) return res.status(400).json({ msg: '用户名不能为空' })

  try {
    // 删除Redis中的刷新令牌
    await redisClient.del(`refresh_token:${username}`)
    res.json({ code: 200, msg: '退出成功' })
  } catch (err) {
    res.status(500).json({ msg: '服务器错误' })
  }
})

// ===================== 6. 个人信息 =====================
app.get('/api/profile', checkPermission(2), (req, res) => {
  res.json({ code: 200, data: req.user })
})

// ===================== 7. 用户列表 =====================
app.get('/api/users', checkPermission(1), async (req, res) => {
  try {
    const usernames = await redisClient.smembers('all:usernames')
    const userList = await Promise.all(
      usernames.map(async (username) => {
        const user = await redisClient.hgetall(`user:${username}`)
        return {
          usrname: username,
          role: user.role,
          level: parseInt(user.level),
          menu_permission: user.menu_permission
        }
      })
    )
    res.json({ code: 200, data: userList })
  } catch (err) {
    res.status(500).json({ msg: '服务器错误' })
  }
})

// ===================== 8. 获取用户菜单 =====================
app.get('/api/user/menus', checkPermission(2), async (req, res) => {
  try {
    const username = req.user?.usrname
    if (!username) {
      return res.status(401).json({ msg: '用户信息无效' })
    }
    const menuPermission = await redisClient.hget(`user:${username}`, 'menu_permission')
    let menuArray = []
    if (menuPermission) {
      try {
        menuArray = JSON.parse(menuPermission)
      } catch (parseErr) {
        menuArray = ['home', 'profile', 'changePwd']
      }
    } else {
      menuArray = ['home', 'profile', 'changePwd']
    }
    res.json({ code: 200, data: menuArray })
  } catch (err) {
    console.error('获取菜单失败:', err)
    res.status(500).json({ msg: '服务器错误：' + err.message })
  }
})

// ===================== 9. 设置菜单权限 =====================
app.post('/api/admin/setMenu', checkPermission(0), async (req, res) => {
  const { username, menus } = req.body;
  try {
    const menuNameMap = {
      1: 'home',
      2: 'profile',
      3: 'userList',
      4: 'changePwd'
    };
    const menuNames = menus.map(num => menuNameMap[num]).filter(Boolean);
    await redisClient.hset(`user:${username}`, 'menu_permission', JSON.stringify(menuNames))
    res.json({ code: 200, msg: '保存成功' });
  } catch (e) {
    console.error('保存菜单失败：', e);
    res.status(500).json({ msg: '保存失败' });
  }
});

// ===================== 10. 删除用户 =====================
app.delete('/api/users/:usrname', checkPermission(1), async (req, res) => {
  const { usrname } = req.params
  const currentUser = req.user
  const username = usrname.trim()

  try {
    const user = await redisClient.hgetall(`user:${username}`)
    if (Object.keys(user).length === 0) {
      return res.status(400).json({ msg: '用户不存在' })
    }
    const targetLevel = parseInt(user.level)

    if (username === currentUser.usrname) {
      return res.status(400).json({ msg: '不能删除自己' })
    }
    if (targetLevel <= currentUser.level) {
      return res.status(403).json({ msg: '不能删除权限等级不低于自己的用户' })
    }

    await redisClient.del(`user:${username}`)
    await redisClient.srem('all:usernames', username)
    // 同时删除该用户的刷新令牌
    await redisClient.del(`refresh_token:${username}`)

    res.json({ code: 200, msg: '删除成功' })
  } catch (err) {
    console.error('删除用户失败:', err)
    res.status(500).json({ msg: '服务器错误' })
  }
})

// ===================== 11. 修改密码 =====================
app.put('/api/changePassword', checkPermission(2), async (req, res) => {
  const { oldPassword, newPassword } = req.body
  const user = req.user
  if (!oldPassword || !newPassword) return res.status(400).json({ msg: '不能为空' })
  try {
    const oldPwdHash = await redisClient.hget(`user:${user.usrname}`, 'password')
    if (!oldPwdHash) return res.status(400).json({ msg: '用户不存在' })
    
    const valid = await bcrypt.compare(oldPassword, oldPwdHash)
    if (!valid) return res.status(400).json({ msg: '旧密码错误' })
    
    const newHash = await bcrypt.hash(newPassword, saltRounds)
    await redisClient.hset(`user:${user.usrname}`, 'password', newHash)
    
    res.json({ code: 200, msg: '修改成功' })
  } catch (err) {
    res.status(500).json({ msg: '服务器错误' })
  }
})

// 启动服务
const PORT = 8081
app.listen(PORT, () => {
  console.log(`✅ 服务已启动：http://localhost:${PORT}`)
})
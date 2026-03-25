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

// 2. 注册
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

// 3. 登录
app.post('/api/login', async (req, res) => {
  const { usrname, password } = req.body
  if (!usrname || !password) return res.status(400).json({ msg: '不能为空' })
  const username = usrname.trim()
  try {
    const user = await redisClient.hgetall(`user:${username}`)
    if (Object.keys(user).length === 0) return res.status(400).json({ msg: '用户不存在' })
    
    const valid = await bcrypt.compare(password, user.password)
    if (!valid) return res.status(400).json({ msg: '密码错误' })
    
    const token = jwt.sign(
      { usrname: username, role: user.role, level: parseInt(user.level) },
      SECRET_KEY,
      { expiresIn: '2h' }
    )
    res.json({
      code: 200,
      data: { 
        token, 
        user: { usrname: username, role: user.role, level: parseInt(user.level) } 
      }
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

// 6. 获取用户菜单
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

// 7. 设置菜单权限
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

// 8. 删除用户
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

    res.json({ code: 200, msg: '删除成功' })
  } catch (err) {
    console.error('删除用户失败:', err)
    res.status(500).json({ msg: '服务器错误' })
  }
})

// 9. 修改密码
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

// 启动
const PORT = 8081
app.listen(PORT, () => {
  console.log(`✅ 服务已启动：http://localhost:${PORT}`)
})
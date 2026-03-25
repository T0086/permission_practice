<template>
  <div class="main-container">
    <img alt="Vue logo" src="../assets/logo.png" class="logo" />
    <div class="form-wrapper">
      <!-- 用户名输入框 -->
      <div class="input-group">
        <input
          v-model="usrname"
          type="text"
          placeholder="Enter Username"
          class="input"
          @blur="checkUsername"
        />
        <span v-if="tip" class="tip" :style="{ color: color }">{{ tip }}</span>
      </div>

      <!-- 密码输入框 -->
      <div class="input-group">
        <input
          v-model="password"
          type="password"
          placeholder="Enter Password"
          class="input"
        />
      </div>

      <!-- 角色选择 + 按钮组 -->
      <div class="btn-group">
        <button
          class="btn signup-btn"
          @click="SignupAction"
          :disabled="loading"
        >
          {{ loading ? 'Processing...' : 'Sign Up' }}
        </button>

        <select v-model="role" class="role-select">
          <option value="Customer">Customer</option>
          <option value="Worker">Worker</option>
          <option value="Admin">Admin</option>
        </select>

        <button class="btn login-btn" @click="LoginAction">Log In</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

// 路由实例
const router = useRouter()

// 响应式数据
const usrname = ref('')
const password = ref('')
const role = ref('Customer')
const tip = ref('')
const color = ref('red')
const loading = ref(false)

// 基础请求配置
const request = axios.create({
  baseURL: 'http://localhost:8081',
  timeout: 5000,
  headers: { 'Content-Type': 'application/json' }
})

// 1. 用户名检测
const checkUsername = async () => {
  if (!usrname.value.trim()) {
    tip.value = 'Username cannot be empty'
    color.value = 'red'
    return
  }

  try {
    const res = await request.get('/api/checkUsername', {
      params: { usrname: usrname.value.trim() }
    })
    tip.value = res.data.msg || 'Username available'
    color.value = 'green'
  } catch (err) {
    console.error('Check username failed:', err)
    if (err.response?.status === 400) {
      tip.value = err.response.data.msg || 'Username exists'
      color.value = 'red'
    } else if (err.response?.status === 404) {
      tip.value = 'API not found, check backend'
      color.value = 'red'
    } else {
      tip.value = 'Server error, try again'
      color.value = 'red'
    }
  }
}

// 2. 注册逻辑
const SignupAction = async () => {
  const username = usrname.value.trim()
  if (!username || !password.value) {
    alert('Please enter username and password')
    return
  }

  loading.value = true
  try {
    const res = await request.post('/api/register', {
      usrname: username,
      password: password.value,
      role: role.value
    })
    alert(res.data.msg || 'Sign up success!')
    // 清空输入
    usrname.value = ''
    password.value = ''
    tip.value = ''
  } catch (err) {
    alert(err.response?.data?.msg || 'Sign up failed')
  } finally {
    loading.value = false
  }
}

// 3. 登录逻辑（核心：保存长短Token）
const LoginAction = async () => {
  const username = usrname.value.trim()
  if (!username || !password.value) {
    alert('Please enter username and password')
    return
  }

  try {
    const res = await request.post('/api/login', {
      usrname: username,
      password: password.value
    })
    // 保存长短Token和用户信息到本地存储
    localStorage.setItem('accessToken', res.data.data.accessToken)   // 短Token
    localStorage.setItem('refreshToken', res.data.data.refreshToken) // 长Token
    localStorage.setItem('currentUser', JSON.stringify(res.data.data.user))
    
    alert('Login success!')
    router.push('/home')
  } catch (err) {
    alert(err.response?.data?.msg || 'Username or password error')
  }
}
</script>

<style scoped>
.main-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: #1a1a1a;
  color: white;
}

.logo {
  height: 180px;
  margin-bottom: 40px;
}

.form-wrapper {
  width: 400px;
  padding: 30px;
  border-radius: 12px;
  background-color: #2c2c2c;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.input-group {
  margin-bottom: 20px;
}

.input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #444;
  border-radius: 8px;
  background-color: #333;
  color: white;
  font-size: 16px;
  box-sizing: border-box;
}

.input::placeholder {
  color: #999;
}

.tip {
  font-size: 14px;
  margin-top: 8px;
  display: block;
}

.btn-group {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 20px;
}

.btn {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.signup-btn {
  background-color: #42b983;
  color: white;
}

.signup-btn:disabled {
  background-color: #666;
  cursor: not-allowed;
}

.login-btn {
  background-color: #007acc;
  color: white;
}

.role-select {
  padding: 12px;
  border-radius: 8px;
  background-color: #333;
  color: white;
  border: 1px solid #444;
}
</style>
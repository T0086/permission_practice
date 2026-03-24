<template>
  <div v-if="route.path === '/'">
    <div class="login-container">
      <div class="login-card">
        <h2>User Login</h2>
        <div class="input-group">
          <label>Username</label>
          <input
            type="text"
            v-model="loginForm.usrname"
            placeholder="Enter username"
            @keyup.enter="handleLogin"
            ref="usernameInput"
          />
        </div>
        <div class="input-group">
          <label>Password</label>
          <input
            type="password"
            v-model="loginForm.password"
            placeholder="Enter password"
            @keyup.enter="handleLogin"
          />
        </div>
        <button class="login-btn" @click="handleLogin">Log In</button>
      </div>
    </div>
  </div>
  <!-- 首页模块 -->
  <div v-else class="home-container">
    <!-- 头部导航 -->
    <header class="header">
      <h1>User Management System</h1>
      <div class="user-info">
        <span>Welcome: {{ currentUser.usrname }} ({{ capitalize(currentUser.role) }} - 等级{{ currentUser.level }})</span>
        <button class="logout-btn" @click="logout">Logout</button>
      </div>
    </header>
    <!-- 等级≤1（Admin/Worker）的用户管理模块 -->
    <div v-if="currentUser.level <= 1" class="admin-module">
      <h2>{{ currentUser.level === 0 ? 'Admin' : 'Worker' }} Panel - User Management</h2>
      <div class="user-list">
        <div class="user-item header-row">
          <span class="col-usrname">Username</span>
          <span class="col-role">Role</span>
          <span class="col-level">Level</span>
          <span class="col-action">Action</span>
        </div>
        <div v-for="user in userList" :key="user.usrname" class="user-item">
          <span class="col-usrname">{{ user.usrname }}</span>
          <span class="col-role">{{ capitalize(user.role) }}</span>
          <span class="col-level">{{ user.level }}</span>
          <button
            class="delete-btn"
            @click="deleteUser(user.usrname)"
            :disabled="getDeleteBtnDisabledStatus(user)"
          >
            {{ getDeleteBtnDisabledStatus(user) ? 'No Delete' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>
    <!-- 等级2（Customer）模块 -->
    <div class="user-module">
      <h2>{{ capitalize(currentUser.role) }} Dashboard</h2>
      <div class="user-dashboard">
        <div class="card">
          <h3>Personal Info</h3>
          <p>Username: {{ currentUser.usrname }}</p>
          <p>Role: {{ capitalize(currentUser.role) }} (等级{{ currentUser.level }})</p>
          <!-- 原修改密码按钮，绑定打开弹窗事件 -->
          <button class="edit-btn" @click="openPwdModal">Change Password</button>
        </div>
        <div class="card">
          <h3>System Info</h3>
          <p>Login Time: {{ loginTime }}</p>
          <p>Server Status: Online</p>
        </div>
      </div>
    </div>

    <!-- 🌟 新增：修改密码弹窗 -->
    <div class="modal-mask" v-if="pwdModalVisible" @click="closePwdModal">
      <div class="modal-content" @click.stop>
        <h3 class="modal-title">Change Password</h3>
        <div class="modal-input-group">
          <label>Old Password</label>
          <input
            type="password"
            v-model="pwdForm.oldPassword"
            placeholder="Enter your old password"
            class="modal-input"
          />
        </div>
        <div class="modal-input-group">
          <label>New Password</label>
          <input
            type="password"
            v-model="pwdForm.newPassword"
            placeholder="Enter your new password"
            class="modal-input"
          />
        </div>
        <div class="modal-btn-group">
          <button class="modal-cancel-btn" @click="closePwdModal">Cancel</button>
          <button class="modal-confirm-btn" @click="handleChangePwd" :disabled="pwdLoading">
            {{ pwdLoading ? 'Processing...' : 'Confirm' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { useRouter, useRoute } from 'vue-router'
const router = useRouter()
const route = useRoute()
// 登录表单数据
const loginForm = ref({
  usrname: '',
  password: ''
})
// 首页用户数据
const currentUser = ref({})
const userList = ref([])
const loginTime = ref(new Date().toLocaleString())
// 用户名输入框ref（自动聚焦）
const usernameInput = ref(null)

// 🌟 新增：修改密码弹窗相关响应式数据
const pwdModalVisible = ref(false) // 弹窗显示隐藏
const pwdLoading = ref(false) // 提交按钮加载状态
const pwdForm = ref({ // 密码表单数据
  oldPassword: '',
  newPassword: ''
})

// 首字母大写函数
const capitalize = (str) => {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}
// 基础请求配置
const request = axios.create({
  baseURL: 'http://localhost:8081',
  timeout: 5000,
  headers: { 'Content-Type': 'application/json' }
})
// 请求拦截器（添加token）
request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)
// 登录逻辑
const handleLogin = async () => {
  if (!loginForm.value.usrname || !loginForm.value.password) {
    alert('Please enter username and password!')
    return
  }
  try {
    const res = await request.post('/api/login', loginForm.value)
    const { token, user } = res.data.data
    localStorage.setItem('token', token)
    localStorage.setItem('currentUser', JSON.stringify(user))
    alert('Login success!')
    router.push('/home')
  } catch (err) {
    alert('Login failed: ' + (err.response?.data?.msg || err.message))
  }
}
// 首页初始化逻辑
const initHomePage = async () => {
  const localUser = localStorage.getItem('currentUser')
  if (!localUser) {
    alert('Please login first')
    router.push('/')
    return
  }
  currentUser.value = JSON.parse(localUser)
  if (currentUser.value.level <= 1) {
    await loadUserList()
  }
}
// 加载用户列表
const loadUserList = async () => {
  try {
    const res = await request.get('/api/users')
    userList.value = res.data.data
  } catch (err) {
    alert('Load user list failed: ' + (err.response?.data?.msg || err.message))
  }
}
// 删除按钮禁用逻辑
const getDeleteBtnDisabledStatus = (targetUser) => {
  return targetUser.level < currentUser.value.level || targetUser.usrname === currentUser.value.usrname
}
// 删除用户
const deleteUser = async (username) => {
  if (!confirm(`Are you sure to delete user: ${username}?`)) return
  try {
    await request.delete(`/api/users/${username}`)
    alert('Delete success!')
    await loadUserList()
  } catch (err) {
    alert('Delete failed: ' + (err.response?.data?.msg || err.message))
  }
}
// 退出登录
const logout = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('currentUser')
  router.push('/')
}

// 🌟 新增：修改密码弹窗相关方法
// 打开弹窗
const openPwdModal = () => {
  pwdModalVisible.value = true
  // 打开时清空表单
  pwdForm.value.oldPassword = ''
  pwdForm.value.newPassword = ''
}
// 关闭弹窗
const closePwdModal = () => {
  pwdModalVisible.value = false
}
// 提交修改密码
const handleChangePwd = async () => {
  // 前端校验
  if (!pwdForm.value.oldPassword || !pwdForm.value.newPassword) {
    alert('Old password and new password cannot be empty!')
    return
  }
  pwdLoading.value = true
  try {
    // 调用后端修改密码接口
    await request.put('/api/changePassword', pwdForm.value)
    alert('Password changed successfully!')
    closePwdModal() // 成功后关闭弹窗
  } catch (err) {
    alert('Change failed: ' + (err.response?.data?.msg || err.message))
  } finally {
    pwdLoading.value = false // 无论成功失败，关闭加载状态
  }
}

// 页面挂载逻辑
onMounted(() => {
  if (route.path === '/' && usernameInput.value) {
    usernameInput.value.focus()
  }
  if (route.path === '/home') {
    initHomePage()
  }
})
</script>

<style scoped>
/* 原有样式全部保留，下面新增弹窗样式 */
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
.login-container {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f5f5f5;
}
.login-card {
  width: 400px;
  padding: 40px;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.1);
}
.login-card h2 {
  text-align: center;
  margin-bottom: 30px;
  color: #2c3e50;
}
.input-group {
  margin-bottom: 20px;
}
.input-group label {
  display: block;
  margin-bottom: 8px;
  color: #333;
  font-weight: 500;
}
.input-group input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 16px;
  box-sizing: border-box;
}
.input-group input:focus {
  outline: none;
  border-color: #3498db;
  box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
}
.login-btn {
  width: 100%;
  padding: 12px;
  background-color: #2c3e50;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
  transition: background-color 0.2s;
}
.login-btn:hover {
  background-color: #34495e;
}
.home-container {
  min-height: 100vh;
  background-color: #f5f5f5;
  color: #333;
  padding-bottom: 40px;
}
.header {
  background-color: #2c3e50;
  color: white;
  padding: 20px 40px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.user-info {
  display: flex;
  gap: 20px;
  align-items: center;
}
.logout-btn {
  padding: 8px 16px;
  background-color: #e74c3c;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.admin-module, .user-module {
  max-width: 1200px;
  margin: 40px auto;
  padding: 0 20px;
  overflow-x: auto;
}
.user-list {
  margin-top: 20px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  min-width: 600px;
}
.user-item {
  display: flex;
  padding: 16px;
  background-color: white;
  border-bottom: 1px solid #eee;
  align-items: center;
  width: 100%;
}
.header-row {
  background-color: #34495e;
  color: white;
  font-weight: bold;
}
.col-usrname {
  flex: 3;
  min-width: 120px;
  padding: 0 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.col-role {
  flex: 1;
  min-width: 80px;
  padding: 0 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
}
.col-level {
  flex: 0.8;
  min-width: 60px;
  padding: 0 8px;
  text-align: center;
}
.col-action {
  flex: 1.2;
  min-width: 100px;
  max-width: 160px;
  padding: 0 8px;
  text-align: center;
}
.delete-btn {
  min-width: 80px;
  max-width: 140px;
  width: 100%;
  padding: 6px 8px;
  background-color: #e74c3c;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  font-size: 13px;
}
.delete-btn:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}
.user-dashboard {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  margin-top: 20px;
}
.card {
  background-color: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
.edit-btn {
  margin-top: 16px;
  padding: 8px 16px;
  background-color: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

/* 🌟 新增：修改密码弹窗样式 */
.modal-mask {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 999;
}
.modal-content {
  width: 400px;
  padding: 30px;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
}
.modal-title {
  text-align: center;
  margin-bottom: 20px;
  color: #2c3e50;
  font-size: 20px;
}
.modal-input-group {
  margin-bottom: 16px;
}
.modal-input-group label {
  display: block;
  margin-bottom: 6px;
  color: #333;
  font-weight: 500;
}
.modal-input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 16px;
  box-sizing: border-box;
}
.modal-input:focus {
  outline: none;
  border-color: #3498db;
  box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
}
.modal-btn-group {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}
.modal-cancel-btn {
  flex: 1;
  padding: 10px;
  background-color: #95a5a6;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
}
.modal-confirm-btn {
  flex: 1;
  padding: 10px;
  background-color: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
}
.modal-confirm-btn:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}
</style>
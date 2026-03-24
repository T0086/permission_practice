<template>
  <div class="layout">
    <!-- 左侧菜单 -->
    <div class="sidebar">
      <h2>Menu</h2>
      <div
        class="menu-item"
        :class="{ active: activeMenu === item.name }"
        v-for="item in menuList"
        :key="item.name"
        @click="switchMenu(item.name)"
      >
        {{ item.label }}
      </div>

      <!-- 只有 admin 显示 菜单管理 -->
      <div
        class="menu-item menu-admin"
        :class="{ active: activeMenu === 'menuSetting' }"
        v-if="currentUser.level === 0"
        @click="switchMenu('menuSetting')"
      >
        🔧 菜单权限管理
      </div>
    </div>

    <!-- 右侧内容 -->
    <div class="main">
      <header class="header">
        <span>Welcome: {{ currentUser.usrname }} ({{ currentUser.role }})</span>
        <button @click="logout">Logout</button>
      </header>

      <div class="content">
        <!-- 首页 -->
        <div v-show="activeMenu === 'home'">
          <h3>首页</h3>
          <p>登录时间：{{ loginTime }}</p>
        </div>

        <!-- 个人信息 -->
        <div v-show="activeMenu === 'profile'">
          <h3>个人信息</h3>
          <p>用户名：{{ currentUser.usrname }}</p>
          <p>角色：{{ currentUser.role }}</p>
          <p>等级：{{ currentUser.level }}</p>
        </div>

        <!-- 修改密码 -->
        <div v-show="activeMenu === 'changePwd'">
          <h3>修改密码</h3>
          <input type="password" v-model="oldPwd" placeholder="旧密码" />
          <input type="password" v-model="newPwd" placeholder="新密码" />
          <button @click="handleChangePwd">确认修改</button>
        </div>

        <!-- 用户列表 -->
        <div v-show="activeMenu === 'userList'" v-if="currentUser.level <= 1">
          <h3>用户列表</h3>
          <div class="user-item" v-for="u in userList" :key="u.usrname">
            {{ u.usrname }} · {{ u.role }}
            <button
              v-if="currentUser.level === 0"
              @click="openSetMenu"
            >
              设置菜单
            </button>
          </div>
        </div>

        <!-- 菜单权限设置 -->
        <div v-show="activeMenu === 'menuSetting'">
          <h3>给用户设置菜单权限</h3>
          <div v-for="u in userList" :key="u.usrname" class="menu-set-item">
            <p>{{ u.usrname }}</p>
            <label>
              <input type="checkbox" v-model="u._menus" value="home">首页
            </label>
            <label>
              <input type="checkbox" v-model="u._menus" value="profile">个人信息
            </label>
            <label>
              <input type="checkbox" v-model="u._menus" value="userList">用户列表
            </label>
            <label>
              <input type="checkbox" v-model="u._menus" value="changePwd">修改密码
            </label>
            <button @click="saveUserMenu(u)">保存</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { useRouter } from 'vue-router'
const router = useRouter()

const currentUser = ref(JSON.parse(localStorage.getItem('currentUser') || '{}'))
const token = ref(localStorage.getItem('token'))
const loginTime = ref(new Date().toLocaleString())

const menuList = ref([])
const activeMenu = ref('home')
const userList = ref([])

const oldPwd = ref('')
const newPwd = ref('')

const request = axios.create({
  baseURL: 'http://localhost:8081',
  headers: { Authorization: `Bearer ${token.value}` }
})

const allMenus = ['home', 'profile', 'userList', 'changePwd']

onMounted(async () => {
  try {
    await loadMyMenus()
    if (currentUser.value?.level <= 1) await loadUserList()
  } catch (e) {
    console.error("加载失败", e)
  }
})

// 加载菜单
async function loadMyMenus() {
  const res = await request.get('/api/user/menus')
  const my = res.data.data
  menuList.value = [
    { name: 'home', label: '首页' },
    { name: 'profile', label: '个人信息' },
    { name: 'userList', label: '用户列表' },
    { name: 'changePwd', label: '修改密码' }
  ].filter(m => my.includes(m.name))
}

// 切换菜单
function switchMenu(name) {
  activeMenu.value = name
}

// 加载用户列表
async function loadUserList() {
  const res = await request.get('/api/users')
  userList.value = res.data.data.map(u => {
    try {
      u._menus = JSON.parse(u.menu_permissions) || allMenus
    } catch (e) {
      u._menus = allMenus
    }
    return u
  })
}

// 打开菜单设置
function openSetMenu() {
  activeMenu.value = 'menuSetting'
}

// 保存用户菜单
async function saveUserMenu(u) {
  try {
    await request.post('/api/admin/setMenu', {
      username: u.usrname,
      menus: u._menus
    })
    alert('保存成功')
  } catch (e) {
    alert('保存失败')
  }
}

// 修改密码
async function handleChangePwd() {
  try {
    await request.put('/api/changePassword', {
      oldPassword: oldPwd.value,
      newPassword: newPwd.value
    })
    alert('修改成功')
  } catch (e) {
    alert(e.response?.data?.msg || '修改失败')
  }
}

// 退出
function logout() {
  localStorage.clear()
  router.push('/')
}
</script>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
}
.sidebar {
  width: 220px;
  background: #2c3e50;
  color: white;
  padding: 20px;
}
.menu-item {
  padding: 12px 16px;
  margin: 6px 0;
  border-radius: 6px;
  cursor: pointer;
}
.menu-item:hover {
  background: #34495e;
}
.menu-item.active {
  background: #3498db;
}
.menu-admin {
  margin-top: 30px;
  color: #ffb74d;
  border: 1px dashed #ffb74d;
}
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.header {
  background: #ecf0f1;
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
}
.content {
  padding: 24px;
  background: #f8f9fa;
  flex: 1;
}
.user-item, .menu-set-item {
  background: white;
  padding: 12px;
  margin: 8px 0;
  border-radius: 8px;
}
input {
  margin: 6px;
  padding: 8px;
}
button {
  padding: 6px 12px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
</style>
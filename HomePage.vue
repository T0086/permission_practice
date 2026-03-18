<template>
  <div class="main-page">
    <!-- 公共头部：所有角色都能看 -->
    <header>
      <h1>用户管理系统</h1>
      <p>当前登录：{{ currentUser.usrname }}（{{ currentUser.role }}）</p>
      <button @click="logout">退出登录</button>
    </header>

    <!-- 权限控制区域：不同角色看不同内容 -->
    <main>
      <!-- 1. 管理员（Admin）专属：用户管理功能 -->
      <div v-if="currentUser.role === 'Admin'" class="admin-section">
        <h2>【管理员专属】用户管理</h2>
        <ul>
          <li v-for="user in usersList" :key="user.usrname">
            {{ user.usrname }}（{{ user.role }}）
            <button @click="deleteUser(user.usrname)">删除</button>
          </li>
        </ul>
      </div>

      <!-- 2. 工作人员（Worker）专属：工单管理功能 -->
      <div v-else-if="currentUser.role === 'Worker'" class="worker-section">
        <h2>【工作人员专属】工单处理</h2>
        <p>待处理工单：5条</p>
        <button>处理工单</button>
      </div>

      <!-- 3. 普通用户（Customer）专属：个人中心 -->
      <div v-else class="customer-section">
        <h2>【普通用户】个人中心</h2>
        <p>你的账户余额：100元</p>
        <button>修改密码</button>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const currentUser = ref({})
const usersList = ref([])

// 页面加载时读取当前登录用户和所有用户列表
onMounted(() => {
  // 1. 获取当前登录用户（登录时存在localStorage）
  const savedUser = JSON.parse(localStorage.getItem('currentUser'))
  if (!savedUser) {
    router.push('/login') // 未登录跳登录页
    return
  }
  currentUser.value = savedUser

  // 2. 管理员才需要读取所有用户列表
  if (savedUser.role === 'Admin') {
    usersList.value = JSON.parse(localStorage.getItem('users')) || []
  }
})

// 删除用户（仅Admin能调用）
const deleteUser = (username) => {
  if (currentUser.value.role !== 'Admin') return // 双重校验，防止手动调用
  usersList.value = usersList.value.filter(u => u.usrname !== username)
  localStorage.setItem('users', JSON.stringify(usersList.value))
  alert(`删除用户：${username}`)
}

// 退出登录
const logout = () => {
  localStorage.removeItem('currentUser')
  router.push('/login')
}
</script>
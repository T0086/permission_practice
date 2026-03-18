<template>
    <text>Admin</text>
    <div class="user_control">
        <ul id="user_list">
        <!-- 循环渲染每个用户，带删除按钮 -->
        <li v-for="user in usersList" :key="user.usrname">
          <span>usr：{{ user.usrname }} | role：{{ user.role }}</span>
          <button @click="deleteUser(user.usrname)" class="delete-btn">删除</button>
        </li>
      </ul>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

// 存储用户列表的响应式数据
const usersList = ref([])

// 页面加载时读取 localStorage 里的用户数据
onMounted(() => {
  const savedUsers = JSON.parse(localStorage.getItem('users')) || []
  usersList.value = savedUsers
})

// 删除用户的方法（根据用户名删除）
const deleteUser = (username) => {
  // 1. 从当前列表中过滤掉要删除的用户
  const updatedUsers = usersList.value.filter(user => user.usrname !== username)
  // 2. 更新响应式数据（页面自动刷新）
  usersList.value = updatedUsers
  // 3. 同步更新到 localStorage
  localStorage.setItem('users', JSON.stringify(updatedUsers))
  alert(`用户 ${username} 已删除！`)
}
</script>

<style scoped>
.user_control {
  margin-top: 20px;
  max-width: 77%;
}
#user_list {
  list-style: none;
  padding: 0;
}
#user_list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  border-bottom: 1px solid #eee;
}
.delete-btn {
  background: #ff4d4f;
  color: white;
  border: none;
  padding: 5px 12px;
  border-radius: 4px;
  cursor: pointer;
}
.delete-btn:hover {
  background: #ff7875;
}
</style>
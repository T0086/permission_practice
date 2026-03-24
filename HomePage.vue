<template>
  <div class="layout">
    <!-- 左侧菜单：根据权限动态生成 -->
    <div class="sidebar">
      <h2>Menu</h2>
      <div
        class="menu-item"
        :class="{ active: activeMenu === item.name }"
        v-for="item in userMenus"
        :key="item.name"
        @click="switchMenu(item.name)"
      >
        {{ item.label }}
      </div>

      <!-- admin专用入口 -->
      <div
        class="menu-item admin-menu"
        v-if="currentUser.level === 0"
        @click="switchMenu('menuSetting')"
      >
        🔧 菜单权限管理
      </div>
    </div>

    <div class="main">
      <header class="header">
        <span>Welcome: {{ currentUser.usrname }}</span>
        <button @click="logout">Logout</button>
      </header>

      <div class="content">
        <!-- 首页 -->
        <div v-show="activeMenu === 'home'">
          <h3>首页</h3>
        </div>

        <!-- 个人信息 -->
        <div v-show="activeMenu === 'profile'">
          <h3>个人信息</h3>
          <p>用户名：{{ currentUser.usrname }}</p>
          <p>角色：{{ currentUser.role }}</p>
        </div>

        <!-- 用户列表 -->
        <div v-show="activeMenu === 'userList'">
          <h3>用户列表</h3>
          <div v-for="u in userList" :key="u.usrname">
            {{ u.usrname }}
            <button @click="editUserMenu(u)">设置菜单</button>
            <!-- 在用户列表项中添加删除按钮 -->
<button
  @click="deleteUser(u)"
  :disabled="!canDeleteUser(u)"
>删除</button>
          </div>
        </div>

        <!-- 修改密码 -->
        <div v-show="activeMenu === 'changePwd'">
          <h3>修改密码</h3>
          <input type="password" v-model="oldPwd" placeholder="旧密码" />
          <input type="password" v-model="newPwd" placeholder="新密码" />
          <button @click="handleChangePwd">提交</button>
        </div>

        <!-- ====================== -->
        <!-- 🎯 admin 菜单权限设置界面 -->
        <!-- ====================== -->
        <div v-show="activeMenu === 'menuSetting'" v-if="currentUser.level === 0">
          <h3>菜单权限管理（数字编号）</h3>

          <div v-for="u in userList" :key="u.usrname" class="menu-card">
            <h4>{{ u.usrname }}</h4>

            <!-- 快速勾选编号 -->
            <div class="menu-check">
              <!-- 替换原来的复选框代码 -->
              <span v-for="num in [1,2,3,4]" :key="num">
                <input
                  type="checkbox"
                  :value="num"
                  :checked="u.editMenuIds.includes(num)"
                  @change="(e) => {
                    const val = parseInt(e.target.value)
                    if (e.target.checked) {
                      // 勾选：添加编号
                      u.editMenuIds.push(val)
                    } else {
                      // 取消勾选：移除编号
                      const idx = u.editMenuIds.indexOf(val)
                      if (idx > -1) u.editMenuIds.splice(idx, 1)
                    }
                  }"
                >
                编号{{ num }}：{{ MENU_CONFIG[num].label }}
              </span>
            </div>

            <!-- 手动添加菜单：编号 + 名字 -->
            <div style="margin:10px 0;">
              <input v-model="u.customId" placeholder="输入编号" style="width:80px" />
              <input v-model="u.customLabel" placeholder="输入菜单名" style="width:120px" />
              <button @click="addCustomMenu(u)">添加</button>
            </div>

            <!-- 当前菜单列表 -->
            <div>
              当前菜单：{{ u.editMenuIds.map(id => MENU_CONFIG[id]?.label || id) }}
            </div>

            <button @click="saveUserMenu(u)">保存权限</button>
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
import { MENU_CONFIG} from '@/utils/menuConfig'

const router = useRouter()
const currentUser = ref(JSON.parse(localStorage.getItem('currentUser')))
const token = ref(localStorage.getItem('token'))
const activeMenu = ref('home')
const userList = ref([])
const userMenus = ref([])

const oldPwd = ref('')
const newPwd = ref('')

const request = axios.create({
  baseURL: 'http://localhost:8081',
  headers: { Authorization: `Bearer ${token.value}` }
})

// 初始化加载菜单
onMounted(async () => {
  await loadUserOwnMenus()
  // 🔴 防止currentUser.value为undefined导致报错
  if (currentUser.value && currentUser.value.level <= 1) {
    await loadAllUsers()
  }
})


// 加载当前用户菜单（加try/catch兜底）
async function loadUserOwnMenus() {
  try {
    const res = await request.get('/api/user/menus')
    const names = res.data.data || [];
    userMenus.value = Object.values(MENU_CONFIG)
      .filter(m => !m.adminOnly && names.includes(m.name)); // 排除admin专属菜单
  } catch (e) {
    console.error('加载个人菜单失败：', e);
    // 失败兜底显示基础菜单
    userMenus.value = [
      { name: 'home', label: '首页' },
      { name: 'profile', label: '个人信息' },
      { name: 'changePwd', label: '修改密码' }
    ];
  }
}
// 判断是否能删除该用户
function canDeleteUser(targetUser) {
  // 不能删除自己
  if (targetUser.usrname === currentUser.value.usrname) return false
  // 不能删除等级 >= 自己的用户
  return targetUser.level > currentUser.value.level
}

// 删除用户
async function deleteUser(u) {
  if (!confirm(`确认删除用户 ${u.usrname}？`)) return
  try {
    await request.delete(`/api/users/${u.usrname}`)
    alert('删除成功')
    await loadAllUsers() // 刷新用户列表
  } catch (e) {
    alert(e.response?.data?.msg || '删除失败')
  }
}

// 加载所有用户（核心修复：name数组转编号数组 + 字段名单数）
async function loadAllUsers() {
  const res = await request.get('/api/users')
  userList.value = res.data.data.map(u => {
    try {
      // 🔴 重点：数据库字段是menu_permission（单数），不是menu_permissions
      const menuNames = JSON.parse(u.menu_permission) || []; 
      // 核心转换：name数组→编号数组（如["home"]→[1]），用于勾选框回显
      u.editMenuIds = Object.keys(MENU_CONFIG)
        .map(Number)
        .filter(num => menuNames.includes(MENU_CONFIG[num].name));
    } catch (e) {
      u.editMenuIds = [];
    }
    u.customId = '';
    u.customLabel = '';
    return u;
  })
}

// 切换菜单
function switchMenu(name) {
  activeMenu.value = name
}

// 编辑用户菜单
function editUserMenu() {
  activeMenu.value = 'menuSetting'
}

// 添加自定义菜单（修复：自定义菜单name加前缀，避免冲突）
function addCustomMenu(u) {
  const id = parseInt(u.customId)
  if (!id || !u.customLabel || MENU_CONFIG[id]) { // 已存在的编号不重复添加
    alert('编号已存在或输入无效！');
    return;
  }
  u.editMenuIds.push(id)
  MENU_CONFIG[id] = { name: `custom_${id}`, label: u.customLabel } // 自定义name
  u.customId = ''
  u.customLabel = ''
}

// 保存菜单权限
async function saveUserMenu(u) {
  try {
    await request.post('/api/admin/setMenu', {
      username: u.usrname,
      menus: u.editMenuIds // 直接传编号数组，比如 [1,2,4]
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
    alert(e.response?.data.msg)
  }
}

// 退出登录
function logout() {
  localStorage.clear()
  router.push('/')
}
</script>

<style scoped>
.layout { display: flex; height: 100vh; }
.sidebar { width: 220px; background: #2c3e50; color: white; padding: 20px; }
.menu-item { padding: 12px; margin: 6px 0; cursor: pointer; border-radius: 6px; }
.menu-item.active { background: #3498db; }
.main { flex: 1; }
.header { padding: 16px; background: #ecf0f1; display: flex; justify-content: space-between; }
.content { padding: 24px; }
.menu-card { background: white; padding: 16px; margin: 10px 0; border-radius: 8px; }
.admin-menu { color: #ffb74d; border: 1px dashed #ffb74d; margin-top: 20px; }
</style>
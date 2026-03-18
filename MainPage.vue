<!-- src/MainPage.vue -->
<template>
    <img alt="Vue logo" src="../assets/logo.png" >
  <div class="part1" id="part1">
    <div class="input_container" id="input_container">
        <input class="input" v-model="usrname" type="text"  placeholder="Enter Username">
        <input class="input" v-model="password" type="password"  placeholder="Enter password">
    </div>
    <div class="btn_container" id="btn_container">
        <button class="btn" id="signup_btn" @click="SignupAction">Sign Up</button>
        <select v-model="role">
            <option value="Customer">Customer</option>
            <option value="Worker">Worker</option>
            <option value="Admin">Admin</option>
        </select>
        <button class="btn" id="login_btn" @click="LoginAction">Log In</button>

    </div>
  </div>
</template>

<script setup>
    import {ref} from 'vue'
    import { useRouter } from 'vue-router' // 导入路由钩子
    import request from '../utils/request'
    const router = useRouter() // 创建路由实例
    const usrname =ref("")
    const password=ref("")
    const role = ref("Customer")
    
    
//注册事件
    const SignupAction = () => {
    // 1. 读取本地用户列表
    const usersList = JSON.parse(localStorage.getItem('users')) || []
    
    // 2. 遍历检查用户名是否已存在（核心：if + some 遍历）
    const isUsernameExist = usersList.some(user => 
        user.usrname.toLowerCase() === usrname.value.toLowerCase()
    )
    

    if (isUsernameExist) { // 用遍历结果做if判断
        alert('用户名已存在！')
        return
    }

    // 3. 不存在则注册
    const newUser = { usrname: usrname.value, password: password.value, role: role.value }
        usersList.push(newUser)
        localStorage.setItem('users', JSON.stringify(usersList))
        alert('注册成功！')
        usrname.value=""
        password.value=""
    }
//登录事件

    const LoginAction = () => {
        const usersList = JSON.parse(localStorage.getItem('users')) || []

  // 4. 判断角色并跳转
  const currentUser = usersList.find(user => 
    user.usrname.toLowerCase() === usrname.value.toLowerCase()  && user.password === password.value
  )
  if (!currentUser) {
    alert('用户名或密码错误！') // 输错密码的专属提示
    return
  }
  if(currentUser){
    alert(currentUser.role + ' 登录成功！')
    localStorage.setItem('currentUser', JSON.stringify(currentUser))
    router.push('/home')
    console.log("what")
  }
//   if (currentUser) { // 用户名+密码都匹配
//     switch(currentUser.role){
//         case 'Admin':
//             alert(currentUser.role + ' 登录成功！')
//             router.push('/admin')
//             break;
//         case 'Worker':
//             alert(currentUser.role + ' 登录成功！')
//             router.push('/worker')
//             break;
//         case 'Customer':
//             alert(currentUser.role + ' 登录成功！')
//             router.push('/customer')
//             break;
//         default:
//             alert('用户名或密码错误！')
//             break;
//         }
//     }
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
}
html, body {
  width: 100%;
  height: 100%;
}
.input_container{
  display: flex;
  /* 让子元素水平居中 */
  flex-direction: column;
  justify-content: center;
  /* 让子元素垂直居中 */
  align-items: center;
  /* 占满整个视口高度 */
  height: 100px;
  width: 100%;
  gap: 10px; /* 给两个输入框加一点间距 */
}
/* 给输入框加一点样式，让它们更好看 */
.input_container input {
  padding: 8px 12px;
  font-size: 14px;
}
.input{
  width: 77%;
  border-radius:50px ;
}
.btn{
  width: 30%;
  height: 30px;
  border-radius: 50px;
}
.btn:hover{
    background-color: #c1c1c1;
    transform: scale(1.05);
}
.btn_container{
    display: flex;
    justify-content: center;
    gap: 50px;
}
</style>
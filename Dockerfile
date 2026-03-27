# 从国内阿里云镜像拉取 node 18（绝对能成功）
FROM alibaba-cloud-linux-3-registry.cn-hangzhou.cr.aliyuncs.com/alinux3/node:20.16

# 容器内工作目录
WORKDIR /app

# 复制依赖清单
COPY package*.json ./

# 用淘宝npm镜像安装依赖（超快）
RUN npm install --registry=https://registry.npmmirror.com

# 复制所有项目代码
COPY . .

# 暴露端口（你的后端是 8081）
EXPOSE 8081

# 启动服务
CMD ["node", "index.js"]
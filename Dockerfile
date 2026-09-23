# 个人技术主页 + 内容管理后台 —— 单进程镜像
#
# 两段式：builder 里跑 vite build，runtime 只带 dist、server/ 与剪枝后的依赖树。
# 运行时不引入 nginx：一个 Node 进程就能同时提供静态文件与 API，
# 不必为静态站再引一个基础镜像，也少一层要维护的反代配置。
#
# 静态站与后台 API 共用同一个进程，是因为会话走 httpOnly cookie ——
# 同源才不必额外处理跨站凭证与 CORS。
#
# 健康检查端点 /healthz 由 server/index.mjs 提供（固定 200 ok）。
# 继续用 node:*-slim 而非 alpine：Node 26 原生带 node:sqlite，免去 better-sqlite3
# 的原生编译，镜像里也就不需要编译工具链。

# ---------------------------------------------------------------- 构建阶段
FROM node:26-bookworm-slim AS build

WORKDIR /app

# 先只复制清单，让依赖层独立于源码变动被缓存。
# .npmrc 一并带入：依赖源被显式锁定为公网规范源，不依赖构建环境的默认配置。
# （构建容器默认跑在 bridge 网络里，指向宿主机内网服务的地址未必可达。）
COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .
# build 脚本含 tsc --noEmit：类型不过就不出镜像，把类型错误挡在构建期
RUN npm run build

# 就地剪掉 devDependencies（vite / tsc / tailwind）再交给运行阶段：
# node_modules 只装一次，不必在运行阶段再 npm ci 拉一遍全量依赖。
RUN npm prune --omit=dev


# ---------------------------------------------------------------- 运行阶段
FROM node:26-bookworm-slim AS runtime

ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    PORT=18007 \
    # 容器内必须监听 0.0.0.0，否则宿主端口映射打不进来
    HOST=0.0.0.0

WORKDIR /app

# 运行期四件套：静态产物、后台服务端、共享内容源、已剪枝的依赖树。
# shared/ 必须带上：建库种子与前台兜底都从它取内容，少了它服务端一启动就 import 失败。
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/node_modules ./node_modules

# 镜像里**不带**离线地区库（约 11 MB）。
# 它由运行期按需获取：首次有人打开访客列表时在后台拉一次，落到 /app/data ——
# 那是这个容器里唯一可写的挂载点，且跨容器重建保留，所以「只需要拉一次」才成立。
# 放进镜像则相反：每次构建都要联网、拉不到就让整个构建失败，而它只是后台的一列地区。

# /app/data 存 SQLite 库（含 WAL）与 2FA 主密钥 .app-secret。
# 先建好并改属主：compose 用 bind mount（./data:/app/data）挂到该路径，
# 宿主目录由流水线/人工 mkdir 后 chown 1000:1000；镜像里也把属主设为 node，
# 双保险确保以 node 身份运行的进程能读写。
# 该目录必须持久化 —— 丢掉它不只是丢内容：主密钥一并丢失后，已绑定的 2FA 密钥
# 解不开（届时只能用恢复码登录，再重新绑定一次）。
RUN mkdir -p /app/data && chown -R node:node /app/data

# 镜像自检：构建期就确认站点壳、后台入口与关键运行期依赖都在，
# 别等容器起来了才发现镜像里是空的。
# 注意这里**不校验地区库** —— 它本来就不该在镜像里；改为确认它的加载器在，
# 少了加载器，地区解析是彻底坏掉而不是「稍后自动补上」。
RUN test -f dist/index.html && test -f server/index.mjs \
 && test -f shared/content.mjs && test -f shared/derive.mjs \
 && test -d dist/assets && ls dist/assets | grep -q '\.js$' \
 && test -d node_modules/express && test -d node_modules/otplib \
 && test -f server/geo.mjs && test -f server/geo-fetch.mjs \
 && echo "镜像内容自检通过"

USER node

EXPOSE 18007

# 容器级健康检查：与流水线的健康检查同源（/healthz），但作用不同 ——
# 这里用于 docker 自身的健康状态，流水线不看它，避免两套判定互相掩盖
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||18007)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.mjs"]

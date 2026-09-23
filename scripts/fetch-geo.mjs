#!/usr/bin/env node
/**
 * 拉取 ip2region 离线地区库（IPv4 xdb，约 11 MB）。
 *
 * 地区库既不进版本库也不进镜像 —— 它是一份**可重新获取的公开数据**，跟着上游更新，
 * 冻结进 git 或镜像都没有意义（前者让每次 clone 都拖 11 MB，后者让每次构建都要联网）。
 *
 * 平时不需要跑这个脚本：服务运行期首次有人打开访客列表时会自己拉（见 server/geo.mjs），
 * 落到持久化目录。它留给两种情况：
 *   1. 想预热 —— 免得第一个打开后台的人先看到一列空白；
 *   2. 想把库备到别的位置（如构建上下文）。
 *
 * 下载与校验的实现都在 `server/geo-fetch.mjs`，与运行期用的是同一份 ——
 * 校验规则最容易在两边写走样，而走样了又最难发现（坏库不报错，只是查不出地区）。
 *
 * 用法：
 *   node scripts/fetch-geo.mjs              # 落到 data/ip2region_v4.xdb
 *   node scripts/fetch-geo.mjs --out vendor # 落到 vendor/ip2region_v4.xdb
 *   node scripts/fetch-geo.mjs --force      # 已有文件也重新拉
 *   node scripts/fetch-geo.mjs --check      # 只校验现有文件，不联网（给 CI 与运维用）
 *
 * 已存在且校验通过时直接跳过（幂等）—— 反复跑不会白下载 11 MB。
 */
import { mkdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchGeoDb, validateGeoDb } from '../server/geo-fetch.mjs'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

const argv = process.argv.slice(2)
const force = argv.includes('--force')
const checkOnly = argv.includes('--check')
const outIdx = argv.indexOf('--out')
const outDir = outIdx !== -1 ? argv[outIdx + 1] : 'data'
if (!outDir) {
  console.error('--out 需要一个目录参数')
  process.exit(2)
}

/*
 * 用 resolve 而不是 join：给了绝对路径（`--check --out /app/data`）就该直接用，
 * join 会把它拼到项目根后面，变成 <root>/app/data 这种看着对、实则错的位置。
 */
const outFile = resolve(projectRoot, outDir, 'ip2region_v4.xdb')

/*
 * --check：只回答「现有这一份能不能用」，不碰网络。
 * 给 CI 与运维一个可脚本化的判定 —— 退出码即结论，不必去解析日志。
 */
if (checkOnly) {
  const bad = validateGeoDb(outFile)
  if (bad) {
    console.error(`地区库不可用：${outFile} —— ${bad}`)
    process.exit(1)
  }
  console.log(`地区库可用：${outFile}（${(statSync(outFile).size / 1e6).toFixed(1)} MB）`)
  process.exit(0)
}

const existing = validateGeoDb(outFile)
if (!force && !existing) {
  console.log(`地区库已就绪：${outFile}`)
  process.exit(0)
}
if (existing && force) console.log(`已有文件不可用（${existing}），强制重新拉取`)

mkdirSync(dirname(outFile), { recursive: true })

try {
  const { url, bytes } = await fetchGeoDb(outFile, { log: (msg) => console.log(msg) })
  console.log(`地区库就绪：${outFile}（${(bytes / 1e6).toFixed(1)} MB，来源 ${url}）`)
} catch (err) {
  console.error(`\n${err.message}`)
  console.error('访客页的地区一列会降级为不可用（其余功能不受影响）。')
  process.exit(1)
}

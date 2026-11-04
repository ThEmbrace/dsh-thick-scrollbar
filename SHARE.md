# 分享 / 安装指南

这个目录已经是一个**可分发的 DSH 插件包**。下面三种形态任选其一分享给别人；对方只要有 DeepSeek Harness，就能装。

| 形态 | 文件 | 适用场景 |
| --- | --- | --- |
| ① 一键包（zip） | `dsh-thick-scrollbar-0.1.1-kit.zip` | **最省事**：发一个文件，里面装着 tgz + git 归档 + 安装说明 |
| ② npm 包（.tgz） | `dsh-thick-scrollbar-0.1.1.tgz` | 最通用的离线分享：发文件、放网盘、挂静态服务器地址都行 |
| ③ git 仓库 | `dsh-thick-scrollbar-0.1.1.bundle` 或直接推 GitHub | 想让对方能看源码 / 能收到更新 |
| ④ 装好后直接给链接 | 无需文件 | 对方和你在同一台机器 / 同一个 profile |

三个文件都不大（zip 约 270 KB、tgz 约 86 KB、bundle 约 188 KB），微信 / 邮件都能直接发。

---

## ① 一键包（最省事）

把 `dsh-thick-scrollbar-0.1.1-kit.zip` 发给对方，他解压后拿到三样东西：

| 文件 | 用途 |
| --- | --- |
| `dsh-thick-scrollbar-0.1.1.tgz` | 装插件用这个 |
| `dsh-thick-scrollbar-0.1.1.bundle` | 想看 / 改源码时用 |
| `share-notes.txt` | 给不看仓库的人看的纯文本安装说明（含校验和与已知边界） |

---

## ② 用 .tgz 安装（推荐给「只想装上的人」）

对方拿到 `dsh-thick-scrollbar-0.1.1.tgz` 后，两条路：

**A. 让 AI 装（最简单）** —— 在 DSH 里对 agent 说：

> 装这个插件：`file:D:/path/to/dsh-thick-scrollbar-0.1.1.tgz`

（换成真实绝对路径；Windows 反斜杠也可以。）

agent 会调用 `plugin_manager install_bundle`，返回 `application: "applied"` 就是装好了，**刷新页面生效**。

**B. 手工写进 profile** —— 编辑 `~/.dsh/profiles/<你的 profile>/package.json`：

```jsonc
{
  "dependencies": {
    "dsh-thick-scrollbar": "file:D:/path/to/dsh-thick-scrollbar-0.1.1.tgz"
  },
  "dsh": {
    "bundles": ["dsh-thick-scrollbar"]   // 加进已有列表，别覆盖
  }
}
```

然后在该目录 `pnpm install`，刷新页面。

**C. 有公网地址时（.tgz 挂在任何 http(s) 上）**

> 装这个插件：`https://example.com/dsh-thick-scrollbar-0.1.1.tgz`

注意：`install_bundle` 对 http(s) URL 只接受**结尾是 `.tgz` / `.tar.gz` 的 tarball**，或 git 仓库地址；普通网页地址会被拒绝（报 `a URL must point at a git repository or a tarball`）。

---

## ③ 用 git 安装

**直接推 GitHub（推荐）** —— 在这个目录执行：

```bash
git remote add origin https://github.com/<你的账号>/dsh-thick-scrollbar.git
git push -u origin main
```

对方就能装：

> 装这个插件：`github:<你的账号>/dsh-thick-scrollbar`

`install_bundle` 支持的 git 形态：`github:owner/repo`、`gitlab:`、`bitbucket:`、`gist:`，以及完整的 `git+https://…` / `https://…git` 地址。

**不推 GitHub 也想给对方源码** —— 用仓库外的单文件归档 `dsh-thick-scrollbar-0.1.1.bundle`：

```bash
git clone dsh-thick-scrollbar-0.1.1.bundle dsh-thick-scrollbar
```

它包含完整提交历史，不需要网络，大小只有几十 KB。

---

## ④ 发布成 npm 包（让别人 `dsh-thick-scrollbar` 一行装）

包名 `dsh-thick-scrollbar` 在 npm 上**目前未被占用**。发布流程（需要你自己的 npm 账号，本机没有登录态，我没有代发）：

```bash
cd dsh-thick-scrollbar
npm login                 # 或用 NPM_TOKEN 环境变量
npm publish --access public
```

发布后别人可以：

> 装这个插件：`dsh-thick-scrollbar` （或 `dsh-thick-scrollbar@0.1.1` 锁版本）

再往后如果进了社区目录 `dsh-plugin-catalog`，就能在 DSH 的设置 → 插件市场里被搜到。

---

## 卸载 / 排错

```
plugin_manager remove_bundle "dsh-thick-scrollbar"
```

- 装完必须**刷新页面**才生效：DSH 的 client bundle 是惰性加载的，热更新不会替换已进图的模块。
- 没效果先看：设置 → 插件里 `dsh-thick-scrollbar` 是否 enabled；浏览器 DevTools Console 是否有 `dsh-thick-scrollbar` 相关报错。
- 滚动条槽宽会永久变成 10px（原 5px），正文窄 5px —— 这是「悬停零重排」的必然代价，详见 README 的「为什么早期版本会抖」。

## 想改参数

编辑 `lib/client.js` 顶部四个常量（`GUTTER_PX` / `REST_BORDER_PX` / `ARM_DISTANCE` / `DISARM_DISTANCE`），刷新即可。用 `link:` 安装时改完立即生效（Host 直接读源目录）；用 `.tgz` 安装时改的是解包副本，升级会用包里的版本覆盖。

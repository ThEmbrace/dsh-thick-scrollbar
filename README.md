# dsh-thick-scrollbar

DSH Web GUI 的小插件：**滚动条默认保持原样（细条、低对比、该隐藏的地方照样隐藏），只有鼠标移到滚动槽附近时临时加粗到 10px**，离开立刻恢复；**加粗过程不改变滚动槽宽度，正文不会横向抖动或位移**。

## 行为

- 基线（插件一加载就注入）：`html body` 上把 `--dsh-scrollbar-width` 定为 10px、`--dsh-scrollbar-thumb-border` 定为 2.5px。透明边框把「绘制的滑块」内缩回 5px（10 − 2×2.5），所以**看起来和原来一样细**，但滚动槽已永久预留 10px 的布局空间。
- 指针进入容器右边缘 13px 窄带（`ARM_DISTANCE`）：只把该容器的 `--dsh-scrollbar-thumb-border` 写成 0px —— 透明边框消失，滑块原地从 5px 画成 10px。槽宽不变，所以**周围内容一格都不移动**。
- 指针离开窄带超过 21px（`DISARM_DISTANCE`，留 8px 迟滞防抖动）：精确还原容器原本的内联值（若原本没有内联值就整条移除）。
- 滚轮滚动时不改变状态：容器不会因为滚动而位移，鼠标还压在滚动槽上就应当保持粗条。

## 为什么早期版本会抖

`::-webkit-scrollbar` 的 `width` 是**参与布局**的：Chromium 会从内容盒里扣掉这段宽度。第一版在悬停时把 `--dsh-scrollbar-width` 从 5px 改成 10px，槽宽变了 5px，旁边所有盒子跟着重排——表现就是画面整体向左缩一下。现在改成「槽宽恒定 10px + 悬停只去掉透明边框」，绘制变粗但布局零变化。headless Chromium 实测：`restGutter=10 armedGutter=10 restContent=290 armedContent=290`。

## 为什么用指针监听而不是纯 CSS `:hover`

纯 CSS `container:hover::-webkit-scrollbar { width: 10px }` 会在鼠标穿过正文时就加粗，滚动条会跟着乱跳。Chromium 还会在指针真正压上原生滚动条后停止派发指针事件，所以这里用「距离右边缘 ≤13px 就提前加粗」的策略：指针还没碰到滚动条，条已经变粗了；压上去之后即使收不到事件，状态也仍然保持。

## 可调参数

都在 `lib/client.js` 顶部：

| 常量 | 默认 | 含义 |
| --- | --- | --- |
| `GUTTER_PX` | `10` | 永久预留的滚动槽宽度，也是悬停时的绘制宽度（px） |
| `REST_BORDER_PX` | `2.5` | 静止态透明边框，决定默认可见细条宽度 = `GUTTER_PX − 2×REST_BORDER_PX` |
| `ARM_DISTANCE` | `GUTTER_PX + 3` | 距右边缘多近开始加粗 |
| `DISARM_DISTANCE` | `GUTTER_PX + 11` | 距右边缘多远恢复 |

想让加粗更明显就抬 `GUTTER_PX`（同时抬 `REST_BORDER_PX` 保持默认细条宽度，否则静止态也会变粗）。改完刷新页面即可，不需要重新安装（本地 `link:` 安装，Host 直接读这个目录）。

## 安装 / 卸载

```bash
# 安装（已于本机完成）
plugin_manager install_bundle "link:D:/deepseek/dsh-thick-scrollbar"
# 卸载
plugin_manager remove_bundle "dsh-thick-scrollbar"
```

## 测试

```bash
node --test test/*.test.mjs   # 必须是 glob；在 Windows 上 node --test test/ 会报 Cannot find module
```

`test/controller.test.mjs` 用最小 DOM stub 直接跑真实的 `lib/client.js`，覆盖：基线样式注入、正文中部不加粗、窄带内加粗且**不动槽宽变量**、离开后精确还原原内联值、无溢出容器不处理、滚轮保持、失焦 / 移出窗口 / 卸载清理。
`test/manifest.test.mjs` 按 `@deepseek-ai/dsh-client-modules` 的严格校验逐条核对 package.json，避免「看起来对、装上不生效」。

两个几何 / 视觉探针（headless Chromium，`--dump-dom` 读数或 `--screenshot` 看图）：

- `test/geometry.html`：验证 `html body` 基线能压过主题的 `body` 规则（即使插入更早），以及加粗前后槽宽与内容宽度完全一致（零重排）。
- `test/visual.html`：四个面板并排对照静止 / 悬停（含 1.6× 放大），底部直接打印 `gutter / painted / content` 三组读数。

## 分享给别人

三条路径（tgz 包 / GitHub 仓库 / npm 发布），含各平台的安装命令、卸载与排错：见 [SHARE.md](./SHARE.md)。

## 边界

- 只处理纵向可滚动容器（`overflow-y: auto|scroll|overlay` 且 `scrollHeight > clientHeight`）。
- 会永久预留 10px 滚动槽（相比主题默认 5px，正文窄 5px），这是「悬停零重排」的代价；`scrollbar-gutter: stable` 的面板同样按 10px 预留。
- 不处理 Firefox 的 `@supports not selector(::-webkit-scrollbar)` 分支（桌面端是 Chromium）。
- 不改主题 token、不改 asar、不引入运行时依赖。

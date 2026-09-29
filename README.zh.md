# dsh-files-drag

> 直接拖动 DeepSeek Harness **内置**「工作区文件」面板里的文件到输入框 ——
> 不另开面板,也没有浮层。

中文 | [English](README.md)

内置文件面板(`@deepseek-ai/dsh-client-ui-sidebar-files`)把每一行渲染成
`<li data-files-path="…">`,但**完全没有拖拽实现** —— 行拖不动,所以任何"接收端"
插件都无能为力。本插件补上缺的那一半:拖动任意文件行到输入框,松手即把它的
**工作区相对路径**作为引用插入草稿。

## 特性

- 在**内置**面板里直接拖,而不是在插件另开的第二个面板里拖。
- 拖到**输入框上** → 由浏览器**在光标处**插入;拖到页面**其它位置** → 追加到草稿末尾。
- 目录同样可拖(插入 `@docs/` 这样的路径)。
- 内置面板给的是绝对路径,插件自动裁剪为工作区相对路径。
- 拖动时输入框出现虚线高亮。
- 引用格式可配置(`{path}` / `{abs}`)。
- 零依赖,只有一个浏览器模块;卸载时它加过的监听、样式与 `draggable` 标记全部复原。

## 安装

```sh
# dsh web 等由 CLI 启动的 profile
dsh plugin --profile web add github:zhengkaixing/dsh-files-drag

# Gitee 镜像(国内更快)
dsh plugin --profile web add git+https://gitee.com/zhengkaixing/dsh-files-drag.git

# 钉版本
dsh plugin --profile web add github:zhengkaixing/dsh-files-drag#v1.0.0
```

装完**重启 DSH 并硬刷新页面**(`Ctrl+F5` / `Cmd+Shift+R`)。

### 桌面应用(`desktop` profile)

CLI 不允许操作 Electron 应用独占管理的 profile:

```
error: profile "desktop" is managed exclusively by the Electron application
```

请在应用自己的插件页面安装,或手工接上:

1. 把本包放到一个稳定目录,例如 `%USERPROFILE%\.dsh\plugins\dsh-files-drag`。
2. 在 `%USERPROFILE%\.dsh\profiles\desktop\package.json` 里加依赖与 bundle 行:

   ```json
   {
     "dependencies": { "dsh-files-drag": "link:C:/Users/<you>/.dsh/plugins/dsh-files-drag" },
     "dsh": { "profile": { "bundles": ["…", "dsh-files-drag"] } }
   }
   ```

3. 用应用自带 runtime 的 pnpm(`%USERPROFILE%\.dsh\dsh-runtimes\…\dependencies\pnpm`)
   在该 profile 目录执行 `pnpm install`,然后重启应用。

## 使用

1. 打开右侧**内置**的工作区文件面板,展开目录。
2. 把文件行拖进输入框并松手:
   - 松在**输入框上** → 引用落在你的**光标处**;
   - 松在**页面其它位置** → 引用**追加到草稿末尾**(走官方 `conversation.input.dock` 的 actions);
   - 按 `Esc` 或在窗口外松手 = 取消,和平时一样。

默认:文件行插入 `@<工作区相对路径>`,目录行插入 `@<路径>/`。之后照常写你的指令,例如
`帮我改 @src/client/main.ts`。

## 配置

在 profile 的 `cordis.patch.yml` 里覆盖该行的引用模板:

```yaml
- id: files-drag
  config:
    format: '[file: {path}]' # 默认 '@{path}',也可用 '{path}' / '{abs}' …
```

占位符:`{path}` = 工作区相对路径(正斜杠,目录带结尾 `/`);`{abs}` = 树上报的绝对路径。
若某个 DSH 版本不把行配置传给纯客户端行,则改 `client.js` 顶部的 `DEFAULT_FORMAT`。

## 原理

| 环节 | 机制 |
|---|---|
| 让行可拖 | `MutationObserver` 给每个 `[data-files-path]` 行加 `draggable`,后续渲染出的新行同样处理 |
| 相对路径 | 行上的绝对 `data-files-path` 按外层 `data-files-root` 裁掉前缀 |
| 拖拽载荷 | `dragstart` 写入 `text/plain` + 私有类型 `application/x-dsh-files-drag`,因此不属于本插件的拖拽一律不碰 |
| 落在输入框 | 交给浏览器原生插入,保留光标位置 |
| 落在别处 | 通过 `conversation.input.dock` 槽位的 `inputActions.setDraft` 追加 |

## 兼容性与已知限制

- 这是**有意的 DOM 级集成**:依赖内置文件面板显式设置的 `data-files-path` /
  `data-files-root` 属性。将来 DSH 若改名这两个属性,拖拽会**静默失效**(行只是变回不可拖,
  不报错、不影响其它功能)。
- 文件与目录都是单个拖拽。内置面板没有多选,因此不支持批量拖。
- "落在输入框"分支匹配 `[data-composer-card] textarea`;若某版本改了输入框结构,该拖拽仍可用,
  只是退化为"追加到末尾"而不是按光标插入。
- 在 DSH `0.2.0-rc.1`(Windows 桌面版)上开发验证,其它版本未逐一测试;本 bundle 没有钉 DSH
  版本,因为它不使用任何私有 API。

## 卸载

把依赖与 `dsh-files-drag` 这行从 profile 的 `package.json` 移除,在该目录执行 `pnpm install`,
重启并硬刷新即可。插件加的 DOM 改动会随它一起清理。

## 许可

MIT

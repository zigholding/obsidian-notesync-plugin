---
title: obsidian-vaultexporter-plugin
ctime: 2024-04-22 20:10
aliases:
  - 
tags:
  - 
NID: 
NIW: 
drafts: true
publish: false
PrevNote: "[[obsidian-sample-plugin]]"
NextNote: "[[vexporter readMe]]"
LocalGitProject: D:\iLanix\isync\Obsidian\.obsidian\plugins\obsidian-vaultexporter-plugin
---

下载 [obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin)，

```bash
cd Your_Vault_DIR/.obsidian/plugins
git clone https://github.com/obsidianmd/obsidian-sample-plugin.git
```

修改 `manifest.json`：

```jsn
{
	"id": "vault-exporter",
	"name": "Vault Exporter",
	"version": "1.0.0",
	"minAppVersion": "0.15.0",
	"description": "Export current note to another Vault.",
	"author": "ZigHolding",
	"isDesktopOnly": true
}
```

```bash
cd obsidian-sample-plugin
npm i # 下载依赖包
npm run dev # 将 main.ts 编译为 main.js
```

开发完成后：将`main.js`、`styles.css`、`mainfest.json` 复制到 ：`VaultFolder/.obsidian/plugins/your-plugin-id/`。


需要先安装 [[obsidian-notechain-plugin]] 和 [[Templater]] 插件。

`Vault Exporter: Set Git Project`：将当前笔记绑定项目笔记。输入目录，生成 `LocalGitProject` 的元数据。

![](./assets/Pasted image 20240422220412.png)

`Vault Exporter: Export readMe`：将当前笔记输出到 readme，笔记引用的图和文件复制到 `LocalGitProject/assets` 下。复制 readme 时，会更换链接。

元数据和附录可以在设置页面更改。

![](./assets/Pasted image 20240422213449.png)


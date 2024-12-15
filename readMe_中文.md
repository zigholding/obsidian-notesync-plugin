v
[English](./README.md) | [中文版](./readMe_中文.md)


本插件依赖：[Templater](https://github.com/SilentVoid13/Templater) 和 [NoteChain](https://github.com/zigholding/obsidian-notechain-plugin)

### 导出笔记

同步文件或文件夹：
1. 在文件列表中，右键点击文件或文件夹；
2. 点击 `mirror to other vault`；
3. 输入目标库根目录；
4. 笔记、文件夹以及笔记嵌入的附件，会按相同的文件结构复制到目标库。如果目录库中存在同名文件，则根据更新时间判定是否覆盖；

导出插件
1. `Note Sync: export plugin`
2. 选择要导出的插件；
4. 选择是否导出 `data.json`；
3. 输入插件保存目录；
5. 输入回车键确认

### 将笔记导出为 readMe

执行 `Note Sync:Set config to export note`，设置导出信息：
- `Dir`：导出路径
- `Name`：文件名称，默认为 readMe
- `Assets`：附件存放路径
- `RemoveMeta`：是否移除元数据，默认为 true
- `UseGitLink`：附件链接使用 Git 格式，默认 true

> [!NOTE]+ 文件导出配置示例
> ```yaml
> note-sync:
>   Dir: D:\github\ObsidianZ-dev\.obsidian\plugins\note-sync
>   Name: readMe_中文
>   Assets: ./assets
>   RemoveMeta: true
>   UseGitLink: true
> ```

再执行  `Note Sync:Export current note`，设置导出笔记。

### 设置页

![Pasted image 20241215125538.png](./assets/Pasted%20image%2020241215125538.png)

> [!NOTE]+ Root dir of vault
> 在导出插件，右键同步文件时，选择预设的库。多个库使用换行分割。

> [!Danger]+ Strict mode
> 右键同步文件夹时，删除在目标文件夹中，但不在源文件夹中的笔记或附件。保证同步的文件夹和当前文件夹是相同的。此设置会删除文件，请谨慎操作。

### 函数

`NoteSync` 提供了三个函数用于同步文件和文件夹，可以在自己的脚本笔记中使用。

`mode` 指当目标库中存在文件时的处理方法：
- `pass`：跳过；
- `overwrite`：覆盖；
- `mtime`：取最新更新时间；

```js
let ns = app.plugins.plugins['note-sync']

// 同步系统文件夹
ns.fsEditor.sync_folder(
	src:string,
	dst:string,
	mode='mtime',
	strict=false
)

// 同步笔记文件夹
ns.fsEditor.sync_tfolder(
	tfolder:TFolder,
	vault_root:string,
	mode='mtime',
	attachment=true,
	outlink=false,
	strict=false
)
```







import {
	Notice, TFile,
	TFolder
} from 'obsidian';

import NoteSyncPlugin from '../main';

const cmd_export_current_note = (plugin: NoteSyncPlugin) => ({
	id: 'export_current_note',
	name: plugin.strings.cmd_export_current_note,
	icon: 'file-export',
	callback: async () => {
		let tfile = plugin.app.workspace.getActiveFile();
		await plugin.export_readme(tfile, null);
	}
});

const cmd_set_vexporter = (plugin: NoteSyncPlugin) => ({
	id: 'set_vexporter',
	name: plugin.strings.cmd_set_vexporter,
	icon: 'settings',
	callback: async () => {
		let tfile = plugin.app.workspace.getActiveFile();
		if (!tfile) { return }
		let dir = await plugin.easyapi.dialog_prompt(plugin.strings.prompt_path_of_folder);
		let item: { [key: string]: any } = {};
		if (plugin.easyapi.fs.fs.existsSync(dir)) {
			item['Dir'] = dir;
		}
		item['Name'] = 'readMe';
		item['Assets'] = './assets';
		item['RemoveMeta'] = true;
		item['UseGitLink'] = true;


		await plugin.app.fileManager.processFrontMatter(
			tfile,
			async (fm) => {
				fm[plugin.yaml] = item
			}
		)
	}
});

const cmd_export_plugin = (plugin: NoteSyncPlugin) => ({
	id: 'export_plugin',
	name: plugin.strings.cmd_export_plugin,
	icon: 'arrow-right-from-line',
	callback: async () => {

		let plugins = Object.keys((plugin.app as any).plugins.plugins);
		let p = await plugin.easyapi.dialog_suggest(plugins, plugins);
		let eplugin = (plugin.app as any).plugins.getPlugin(p);
		if (eplugin) {
			let paths = plugin.settings.vaultDir.split("\n")
			let target = await plugin.easyapi.fs.select_valid_dir(
				paths
			)
			if (target) {
				let items = plugin.easyapi.fs.list_dir(target, false)
				items = items.filter((x: string) => x.startsWith('.') && x != '.git').filter(
					(x: string) => {
						let path = plugin.easyapi.fs.path.join(target, x)
						if (!plugin.easyapi.fs.isdir(path)) {
							return false
						}
						let items = plugin.easyapi.fs.list_dir(path, false)
						return items.contains('plugins')
					}
				)
				if (items.length == 1) {
					target = plugin.easyapi.fs.path.join(target, items[0], 'plugins')
				} else if (items.length > 1) {
					let item = await plugin.easyapi.dialog_suggest(
						items, items, 'config'
					)
					if (item) {
						target = plugin.easyapi.fs.path.join(target, item, 'plugins')
					}
				}
			}
			if (!plugin.easyapi.fs.fs.existsSync(target) ||
				plugin.easyapi.fs.path.basename(target) != 'plugins') {
				target = await plugin.easyapi.dialog_prompt(plugin.strings.prompt_path_of_folder);
			}

			target = target.replace(/\\/g, '/');
			if (!target.endsWith('/' + p)) {
				target = target + '/' + p;
			}
			if (!plugin.easyapi.fs.fs.existsSync(target)) {
				plugin.easyapi.fs.fs.mkdirSync(target);
			}
			let items = ['main.js', 'manifest.json', 'styles.css'];
			let dj = await plugin.easyapi.dialog_suggest(
				[plugin.strings.item_skip_data_json, plugin.strings.item_copy_data_json],
				[false, true],
				''
			)
			if (dj) {
				items.push('data.json')
			}
			for (let item of items) {
				let src = `${plugin.easyapi.fs.root}/${eplugin.manifest.dir}/${item}`;
				let dst = `${target}/${item}`;
				let flag = plugin.easyapi.fs.copy_file(src, dst, 'overwrite');
				if (flag) {
					console.log(`Copy ${item} to ${target}`, 5000)
				}
			}
		}
	}
});

const cmd_download_git_repo = (plugin: NoteSyncPlugin) => ({
	id: 'cmd_download_git_repo',
	name: plugin.strings.cmd_download_git_repo,
	icon: 'cloud-download',
	callback: async () => {
		let repos = plugin.settings.git_repo.split('\n')
		let repo = await plugin.easyapi.dialog_suggest(repos, repos);
		if (!repo) { return }

		let match = repo.match(/^https?:\/\/(.*)\.com\/([^/]*)\/([^/]*)\/tree\/([^/]*)\/?(.*)$/);
		if (!match) { return }

		let SOURCE = match[1]; // gitee
		let repoOwner = match[2]; // 开发者
		let repoName = match[3]; // 项目名称
		let branch = match[4]; // 分支名称
		let path = match[5];  // 初始路径

		async function list_files_of_path(repoOwner: string, repoName: string, path: string, branch = 'master') {
			let url;
			if (SOURCE == 'github') {
				url = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${path}?ref=${branch}`;
			} else {
				url = `https://gitee.com/api/v5/repos/${repoOwner}/${repoName}/contents/${path}?ref=${branch}`
			}
			let req = await (window as any).requestUrl(url)
			req = JSON.parse(req.text)
			if (!Array.isArray(req)) {
				req = [req]
			}
			return req
		}

		async function download_file(url: string, folder_path: string, file_name: string) {
			let req = await (window as any).requestUrl(url)
			// req = JSON.parse(req.text)
			// let ctx = atob(req.content)
			let ctx = req.text
			let tfile_path = `${folder_path}/${file_name}`
			// console.log(ctx)
			if (folder_path.startsWith('.')) {
				let flag = (plugin.app.vault as any).exists(folder_path);
				if (!flag) {
					await plugin.app.vault.createFolder(folder_path)
				}
				flag = (plugin.app.vault as any).exists(tfile_path);
				if (flag) {
					await (plugin.app.vault as any).adapter.remove(tfile_path)
					await plugin.app.vault.create(tfile_path, ctx)
					new Notice(`更新：${tfile_path}`, 5000)
				} else {
					await plugin.app.vault.create(tfile_path, ctx)
					new Notice(`下载：${tfile_path}`, 5000)
				}
			} else {
				let folder = plugin.app.vault.getFolderByPath(folder_path)
				if (!folder) {
					folder = await plugin.app.vault.createFolder(folder_path)
				}

				let tfile = plugin.app.vault.getFileByPath(tfile_path)
				if (!tfile) {
					await plugin.app.vault.create(tfile_path, ctx);
					new Notice(`下载：${tfile_path}`, 5000)
				} else {
					await plugin.app.vault.modify(tfile, ctx)
					new Notice(`更新：${tfile.path}`, 5000)
				}
			}

		}

		async function download_file_of_dir(repoOwner: string, repoName: string, path: string, branch: string) {
			let items = await list_files_of_path(repoOwner, repoName, path, branch)
			let nc = this.app.plugins.getPlugin('note-chain');
			let item = await nc.dialog_suggest(
				items.map((x: any) => (x.type == 'file' ? '📃' : '📁') + x.path),
				items, '', true
			);
			if (!item) { return }
			if (typeof (item) == 'string' && item == 'all') {
				for (let item of items) {
					if (item.type == 'file') {
						let file_name = item.path.split('/').last();
						let folder_path = item.path.slice(0, item.path.length - file_name.length - 1);
						await download_file(item.download_url, folder_path, file_name)
					}
				}
			} else if (item.type == 'file') {
				let file_name = item.path.split('/').last();
				let folder_path = item.path.slice(0, item.path.length - file_name.length - 1);
				await download_file(item.download_url, folder_path, file_name)
			} else if (item.type == 'dir') {
				await download_file_of_dir(repoOwner, repoName, item.path, branch)
			}
		}

		download_file_of_dir(repoOwner, repoName, path, branch)

	}
});

const cmd_export_wxmp = (plugin: NoteSyncPlugin) => ({
	id: 'cmd_export_wxmp',
	name: plugin.strings.cmd_export_wxmp,
	icon: 'aperture',
	hotkeys: [{ modifiers: ['Alt', 'Shift'], key: 'P' }],
	callback: async () => {
		if (!plugin.easyapi.cfile) { return }
		let ctx = plugin.easyapi.ceditor.getSelection();
		if (!ctx) {
			plugin.wxmp.tfile_to_wxmp(plugin.easyapi.cfile);
		} else {
			await plugin.wxmp.selection_to_wxmp();
		}
		new Notice(`${plugin.strings.cmd_export_wxmp}: OK`, 5000)
	}
});

const cmd_export_as_single_note = (plugin: NoteSyncPlugin) => ({
	id: 'cmd_export_as_single_note',
	name: plugin.strings.cmd_export_as_single_note,
	icon: 'aperture',
	// hotkeys: [{ modifiers: ['Alt', 'Shift'], key: 'P' }],
	callback: async () => {
		if (!plugin.easyapi.cfile) { return }

		const fs = require("fs");
		const path = require("path");
		const { dialog } = require("electron").remote;

		let cfiles = plugin.easyapi.file.get_selected_files();
		if(cfiles.length<=2){
			// 1. 当前文件
			let cfile = plugin.easyapi.cfile;
			if (!cfile) {
				new Notice("未找到当前文件");
				return;
			}

			// 2. 读取内容
			let n = 0;
			if(cfile.parent && cfile.parent.children.filter((x : any)=> x instanceof TFolder).length>0){
				n = await plugin.easyapi.dialog_suggest([`-1 - All`,`0 - Brother`,`1 - Subfolder`],[-1,0,1]);
				if(n == null){n=0}
			}

			cfiles = plugin.easyapi.file.get_tfiles_of_folder(cfile.parent,n)
		}
		
		if(plugin.easyapi.nc){
			cfiles = plugin.easyapi.nc.chain.sort_tfiles_by_chain(cfiles);
		}

		if(cfiles.length==0){
			new Notice("没有文件");
			return;
		}

		// 3. 打开「另存为」对话框
		const result = await dialog.showSaveDialog({
			title: plugin.strings.cmd_export_as_single_note,
			defaultPath: (cfiles[0].parent?.name || cfiles[0].basename+'_parent') + ".md",
			filters: [
				{ name: "Markdown", extensions: ["md"] },
				{ name: "All Files", extensions: ["*"] }
			]
		});

		if (result.canceled || !result.filePath) {
			new Notice("已取消另存为");
			return;
		}

		let content = '';
		for(let cfile of cfiles){
			let tmp = await plugin.app.vault.read(cfile);
			content = content + `=====\n${cfile.name}\n=====\n\n${tmp}\n\n`
		}
		// 4. 写入外部文件
		fs.writeFileSync(result.filePath, content, "utf-8");

		new Notice(`已保存到：${result.filePath}`);
	}
});



const commandBuilders: Array<Function> = [
	cmd_export_wxmp,

];

const commandBuildersDesktop: Array<Function> = [
	cmd_export_current_note,
	cmd_set_vexporter,
	cmd_export_plugin,
	cmd_download_git_repo,
	cmd_export_wxmp,
	cmd_export_as_single_note
];

export function addCommands(plugin: NoteSyncPlugin) {
	commandBuilders.forEach((c) => {
		plugin.addCommand(c(plugin));
	});
	if ((plugin.app as any).isMobile == false) {
		commandBuildersDesktop.forEach((c) => {
			plugin.addCommand(c(plugin));
		});
	}
}
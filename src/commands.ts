import { 
	Notice, TFile
} from 'obsidian';

import NoteSyncPlugin from '../main';
import { it } from 'node:test';

const cmd_export_current_note = (plugin:NoteSyncPlugin) => ({
	id: 'export_current_note',
	name: plugin.strings.cmd_export_current_note,
	callback: async () => {
		let tfile = plugin.app.workspace.getActiveFile();
		await plugin.export_readme(tfile,null);
	}
});

const cmd_set_vexporter = (plugin:NoteSyncPlugin) => ({
	id: 'set_vexporter',
	name: plugin.strings.cmd_set_vexporter,
	callback: async () => {
		let tfile = plugin.app.workspace.getActiveFile();
		if(!tfile){return}
		let dir = await plugin.dialog_prompt(plugin.strings.prompt_path_of_folder);
		let item: { [key: string]: any } = {};
		if(plugin.fsEditor.fs.existsSync(dir)){
			item['Dir'] = dir;
		}
		item['Name'] = 'readMe';
		item['Assets'] = './assets';
		item['RemoveMeta'] = true;
		item['UseGitLink'] = true;


		await plugin.app.fileManager.processFrontMatter(
			tfile,
			async(fm) =>{
				fm[plugin.yaml] = item
			}
		)
	}
});

const cmd_export_plugin = (plugin:NoteSyncPlugin) => ({
	id: 'export_plugin',
	name: plugin.strings.cmd_export_plugin,
	callback: async () => {
		
		let plugins = Object.keys((plugin.app as any).plugins.plugins);
		let p = await plugin.dialog_suggest(plugins,plugins);
		let eplugin = (plugin.app as any).plugins.getPlugin(p);
		if(eplugin){
			let paths = plugin.settings.vaultDir.split("\n")
			let target = await plugin.fsEditor.select_valid_dir(
				paths
			)
			if(target){
				let items = plugin.fsEditor.list_dir(target,false)
				items = items.filter((x:string)=>x.startsWith('.') && x!='.git').filter(
					(x:string)=>{
						let path = plugin.fsEditor.path.join(target,x)
						if(!plugin.fsEditor.isdir(path)){
							return false
						}
						let items = plugin.fsEditor.list_dir(path,false)
						return items.contains('plugins')
					}
				)
				if(items.length==1){
					target = plugin.fsEditor.path.join(target,items[0],'plugins')
				}else if(items.length>1){
					let item = await plugin.dialog_suggest(
						items,items,'config'
					)
					if(item){
						target = plugin.fsEditor.path.join(target,item,'plugins')
					}
				}
			}
			if(!plugin.fsEditor.fs.existsSync(target) || 
				plugin.fsEditor.path.basename(target)!='plugins'){
				target = await plugin.dialog_prompt(plugin.strings.prompt_path_of_folder);
			}

			target = target.replace(/\\/g,'/');
			if(!target.endsWith('/' + p)){
				target = target + '/' + p;
			}
			if(!plugin.fsEditor.fs.existsSync(target)){
				plugin.fsEditor.fs.mkdirSync(target);
			}
			let items = ['main.js','manifest.json','styles.css'];
			let dj = await plugin.dialog_suggest(
				[plugin.strings.item_skip_data_json,plugin.strings.item_copy_data_json],
				[false,true],
				''
			)
			if(dj){
				items.push('data.json')
			}
			for(let item of items){
				let src = `${plugin.fsEditor.root}/${eplugin.manifest.dir}/${item}`;
				let dst = `${target}/${item}`;
				let flag = plugin.fsEditor.copy_file(src,dst,'overwrite');
				if(flag){
					console.log(`Copy ${item} to ${target}`,5000)
				}
			}
		}
	}
});

const cmd_download_git_repo = (plugin:NoteSyncPlugin) => ({
	id: 'cmd_download_git_repo',
	name: plugin.strings.cmd_download_git_repo,
	callback: async () => {
		let repos = plugin.settings.git_repo.split('\n')
		let repo = await plugin.dialog_suggest(repos,repos);
		if(!repo){return}

		let match = repo.match(/^https?:\/\/(.*)\.com\/([^/]*)\/([^/]*)\/tree\/([^/]*)\/?(.*)$/);
		if(!match){return}

		let SOURCE = match[1]; // gitee
		let repoOwner = match[2]; // 开发者
		let repoName = match[3]; // 项目名称
		let branch = match[4]; // 分支名称
		let path = match[5];  // 初始路径
		
		async function list_files_of_path(repoOwner:string, repoName:string, path:string, branch = 'master') {
			let url;
			if(SOURCE=='github'){
				url = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${path}?ref=${branch}`;
			}else{
				url = `https://gitee.com/api/v5/repos/${repoOwner}/${repoName}/contents/${path}?ref=${branch}`
			}
			let req = await (window as any).requestUrl(url)
			req = JSON.parse(req.text)
			if(!Array.isArray(req)){
				req = [req]
			}
			return req
		}

		async function download_file(url:string,folder_path:string,file_name:string){
			let req = await (window as any).requestUrl(url)
			// req = JSON.parse(req.text)
			// let ctx = atob(req.content)
			let ctx = req.text
			let tfile_path = `${folder_path}/${file_name}`
			// console.log(ctx)
			if(folder_path.startsWith('.')){
				let flag = (plugin.app.vault as any).exists(folder_path);
				if(!flag){
					await plugin.app.vault.createFolder(folder_path)
				}
				flag = (plugin.app.vault as any).exists(tfile_path);
				if(flag){
					await (plugin.app.vault as any).adapter.remove(tfile_path)
					await plugin.app.vault.create(tfile_path,ctx)
					new Notice(`更新：${tfile_path}`,5000)
				}else{
					await plugin.app.vault.create(tfile_path,ctx)
					new Notice(`下载：${tfile_path}`,5000)
				}
			}else{
				let folder = plugin.app.vault.getFolderByPath(folder_path)
				if(!folder){
					folder = await plugin.app.vault.createFolder(folder_path)
				}
				
				let tfile = plugin.app.vault.getFileByPath(tfile_path)
				if(!tfile){
					await plugin.app.vault.create(tfile_path,ctx);
					new Notice(`下载：${tfile_path}`,5000)
				}else{
					await plugin.app.vault.modify(tfile,ctx)
					new Notice(`更新：${tfile.path}`,5000)
				}
			}
			
		}

		async function download_file_of_dir(repoOwner:string, repoName:string, path:string, branch:string){
			let items = await list_files_of_path(repoOwner, repoName, path, branch)
			let nc = this.app.plugins.getPlugin('note-chain');
			let item = await nc.dialog_suggest(
				items.map((x:any)=>(x.type=='file'?'📃':'📁')+x.path),
				items,'',true
			);
			if(!item){return}
			if(typeof(item)=='string' && item=='all'){
				for(let item of items){
					if(item.type=='file'){
						let file_name = item.path.split('/').last();
						let folder_path = item.path.slice(0,item.path.length-file_name.length-1);
						await download_file(item.download_url,folder_path,file_name)
					}
				}
			}else if(item.type=='file'){
				let file_name = item.path.split('/').last();
				let folder_path = item.path.slice(0,item.path.length-file_name.length-1);
				await download_file(item.download_url,folder_path,file_name)
			}else if(item.type=='dir'){
				await download_file_of_dir(repoOwner, repoName, item.path, branch)
			}
		}

		download_file_of_dir(repoOwner, repoName, path, branch)

	}
});


const commandBuilders:Array<Function> = [
    
];

const commandBuildersDesktop:Array<Function> = [
	cmd_export_current_note,
	cmd_set_vexporter,
	cmd_export_plugin,
	cmd_download_git_repo
];

export function addCommands(plugin:NoteSyncPlugin) {
    commandBuilders.forEach((c) => {
        plugin.addCommand(c(plugin));
    });
	if((plugin.app as any).isMobile==false){
		commandBuildersDesktop.forEach((c) => {
			plugin.addCommand(c(plugin));
		});
	}
}
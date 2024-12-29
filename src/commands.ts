import { 
	Notice, TFile
} from 'obsidian';

import NoteSyncPlugin from '../main';
import { it } from 'node:test';

const cmd_export_current_note = (plugin:NoteSyncPlugin) => ({
	id: 'cmd_export_current_note',
	name: plugin.strings.cmd_export_current_note,
	callback: async () => {
		let tfile = plugin.app.workspace.getActiveFile();
		await plugin.export_readme(tfile,null);
	}
});

const cmd_set_vexporter = (plugin:NoteSyncPlugin) => ({
	id: 'cmd_set_vexporter',
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
	id: 'cmd_export_plugin',
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
					new Notice(`Copy ${item} to ${target}`,5000)
				}
			}
		}
	}
});

const commandBuilders:Array<Function> = [
    
];

const commandBuildersDesktop:Array<Function> = [
	cmd_export_current_note,
	cmd_set_vexporter,
	cmd_export_plugin
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
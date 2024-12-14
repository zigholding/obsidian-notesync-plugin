import { 
	Notice, TFile
} from 'obsidian';

import VaultExpoterPlugin from '../main';

const cmd_export_current_note = (plugin:VaultExpoterPlugin) => ({
	id: 'cmd_export_current_note',
	name: plugin.strings.cmd_export_current_note,
	callback: async () => {
		const nc = plugin.notechain;
		let tfile = nc.chain.current_note;
		await plugin.export_readme(tfile,null);
	}
});

const cmd_set_vexporter = (plugin:VaultExpoterPlugin) => ({
	id: 'cmd_set_vexporter',
	name: plugin.strings.cmd_set_vexporter,
	callback: async () => {
		const nc = plugin.notechain;
		let dir = await nc.chain.tp_prompt(plugin.strings.prompt_path_of_folder);
		let item: { [key: string]: any } = {};
		if(plugin.fsEditor.fs.existsSync(dir)){
			item['Dir'] = dir;
		}
		item['Name'] = 'readMe';
		item['Assets'] = './assets';
		item['RemoveMeta'] = true;
		item['UseGitLink'] = true;

		await nc.editor.set_frontmatter(
			nc.chain.current_note,
			'vexporter',
			item
		)
	}
});

const cmd_export_plugin = (plugin:VaultExpoterPlugin) => ({
	id: 'cmd_export_plugin',
	name: plugin.strings.cmd_export_plugin,
	callback: async () => {
		const nc = plugin.notechain;
		
		let plugins = Object.keys((plugin.app as any).plugins.plugins);
		let p = await nc.chain.tp_suggester(plugins,plugins);
		let eplugin = (plugin.app as any).plugins.getPlugin(p);
		if(eplugin){
			let target = await plugin.fsEditor.select_valid_dir(
				plugin.settings.pluginDirExporter.split("\n")
			)
			if(!plugin.fsEditor.fs.existsSync(target)){
				target = await nc.chain.tp_prompt(plugin.strings.prompt_path_of_folder);
			}
			target = target.replace(/\\/g,'/');
			if(!target.endsWith('/' + p)){
				target = target + '/' + p;
			}
			if(!plugin.fsEditor.fs.existsSync(target)){
				plugin.fsEditor.fs.mkdirSync(target);
			}
			let items = ['main.js','manifest.json','styles.css'];
			for(let item of items){
				let src = `${plugin.fsEditor.root}/${eplugin.manifest.dir}/${item}`;
				let dst = `${target}/${item}`;
				plugin.fsEditor.copy_file(src,dst,'overwrite');
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

export function addCommands(plugin:VaultExpoterPlugin) {
    commandBuilders.forEach((c) => {
        plugin.addCommand(c(plugin));
    });
	if((plugin.app as any).isMobile==false){
		commandBuildersDesktop.forEach((c) => {
			plugin.addCommand(c(plugin));
		});
	}
}
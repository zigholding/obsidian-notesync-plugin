import * as Module from 'module';
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

import { FsEditor } from 'src/fseditor';
import { strings } from 'src/strings';

interface VExporterSettings {
	pluginDirExporter:string;
}

const DEFAULT_SETTINGS: VExporterSettings = {
	pluginDirExporter:''
}


const cmd_export_current_note = (plugin:VaultExpoterPlugin) => ({
	id: 'cmd_export_current_note',
	name: strings.cmd_export_current_note,
	callback: async () => {
		const nc = plugin.notechain;
		let tfile = nc.chain.current_note;
		await plugin.export_readme(tfile,null);
	}
});

const cmd_set_vexporter = (plugin:VaultExpoterPlugin) => ({
	id: 'cmd_set_vexporter',
	name: strings.cmd_set_vexporter,
	callback: async () => {
		const nc = plugin.notechain;
		let dir = await nc.chain.tp_prompt(strings.prompt_path_of_folder);
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
	name: strings.cmd_export_plugin,
	callback: async () => {
		const nc = plugin.notechain;
		
		let plugins = Object.keys((plugin.app as any).plugins.plugins);
		let p = await nc.chain.tp_suggester(plugins,plugins);
		let eplugin = (plugin.app as any).plugins.getPlugin(p);
		if(eplugin){
			let target = plugin.settings.pluginDirExporter;
			if(!plugin.fsEditor.fs.existsSync(target)){
				target = await nc.chain.tp_prompt(strings.prompt_path_of_folder);
			}
			target = target.replace(/\\/g,'/');
			if(!target.endsWith('/' + p)){
				target = target + '/' + p;
			}
			if(!plugin.fsEditor.fs.existsSync(target)){
				plugin.fsEditor.fs.mkdirSync(target);
			}
			let items = ['main.js','manifest.json','styles.css','data.json'];
			for(let item of items){
				let src = `${plugin.fsEditor.root}/${eplugin.manifest.dir}/${item}`;
				let dst = `${target}/${item}`;
				plugin.fsEditor.copy_file_by_path(src,dst,'overwrite');
				new Notice(`${strings.notice_output}${p}/${item}`,3000);
			}
		}
	}
});

const commandBuilders = [
	cmd_export_current_note,
	cmd_set_vexporter,
	cmd_export_plugin
];

function addCommands(plugin:VaultExpoterPlugin) {
    commandBuilders.forEach((c) => {
        plugin.addCommand(c(plugin));
    });
}

export default class VaultExpoterPlugin extends Plugin {
	settings: VExporterSettings;
	fsEditor : FsEditor;
	async onload() {
		await this.loadSettings();
		this.fsEditor = new FsEditor(this);
		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new VExporterSettingTab(this.app, this));
		addCommands(this);
	}

	onunload() {

	}

	get notechain(){
		return (this.app as any).plugins.getPlugin('note-chain');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
	
	async export_readme(tfile:TFile,dst:string|null){
		let nc = (this.app as any).plugins.getPlugin('note-chain');
		if(!tfile){tfile = nc.chain.current_note;}
		
		// 设置输出目录
		if(!dst){
			dst = nc.editor.get_frontmatter(tfile,'vexporter')?.Dir;
			if(!dst){
				dst = await nc.chain.tp_prompt('Path of LocalGitProject');
			}
		}
		if(!dst || !this.fsEditor.fs.existsSync(dst)){
			new Notice(strings.notice_nosuchdir,3000);
			return;
		}
		dst = dst.replace(/\\/g,'/');
		
		
		// 导出当前笔记
		let tmp;
		let name = nc.editor.get_frontmatter(tfile,'vexporter')?.Name;
		if(name && !(name==='')){
			tmp = dst+'/'+name+'.md';
		}else{
			tmp = dst+'/'+tfile.basename+'.md';
		}

		if(this.fsEditor.copy_tfile(tfile,tmp)){
			if(nc.editor.get_frontmatter(tfile,'vexporter')?.RemoveMeta){
				const ufunc = (path:string,data:string)=>{
					let res = data;
					if(nc.editor.get_frontmatter(tfile,'vexporter')?.RemoveMeta){
						res = res.replace(
							/---[\n(\r\n)][\s\S]*?---[\n(\r\n)]/,
							''
						)
					}
					if(nc.editor.get_frontmatter(tfile,'vexporter')?.UseGitLink && assets){
						res = res.replace(
							/\!\[\[(.*?)\]\]/g,
							(match:any, name:string) => {
								return `![${name}](${assets}/${name})`;
							}
						)
					}
					return res
				}
				await this.fsEditor.modify(tmp,ufunc);
			}
		}
		// 导出附件
		let assets = nc.editor.get_frontmatter(tfile,'vexporter')?.Assets;
		if(assets){
			let olinks = nc.chain.get_outlinks(tfile);
			let adir = dst+'/'+assets;
			this.fsEditor.mkdirRecursiveSync(adir);
			for(let f of olinks){
				if(!(f.extension==='md')){
					this.fsEditor.copy_tfile(f,adir+'/'+f.basename+'.'+f.extension);
				}
			}
		}
	}
}

class VExporterSettingTab extends PluginSettingTab {
	plugin: VaultExpoterPlugin;
	

	constructor(app: App, plugin: VaultExpoterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingValue(field: keyof VExporterSettings) {
		return this.plugin.settings[field];
	}

	add_toggle(name:string,desc:string,field:keyof VExporterSettings){
		const {containerEl} = this;
		let value = (this.plugin.settings as any)[field] as boolean;
		let item = new Setting(containerEl)  
			.setName(name)
			.setDesc(desc)
			.addToggle(text => text
				.setValue(value)
				.onChange(async (value:never) => {
					this.plugin.settings[field] = value;
					await this.plugin.saveSettings();
				})
			);
		return item;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();
		
		new Setting(containerEl)
			.setName(strings.setting_plugin_dir)
			.addText(text => text
				.setValue(this.plugin.settings.pluginDirExporter)
				.onChange(async (value) => {
					this.plugin.settings.pluginDirExporter = value;
					await this.plugin.saveSettings();
				}));
		
	}
}

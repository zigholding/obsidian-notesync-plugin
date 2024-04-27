import * as Module from 'module';
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

import { FsEditor } from 'src/fseditor';
import { strings } from 'src/strings';

interface VExporterSettings {
	nameLocalGitProject: string;
	assetsLocalGitProject:string;
	readmeRemoveFrontmatter:boolean;
	pluginDirExporter:string;
}

const DEFAULT_SETTINGS: VExporterSettings = {
	nameLocalGitProject: 'LocalGitProject',
	readmeRemoveFrontmatter:true,
	assetsLocalGitProject: 'assets',
	pluginDirExporter:''
}


const cmd_export_readme = (plugin:VaultExpoterPlugin) => ({
	id: 'export_readme',
	name: strings.cmd_export_readme,
	callback: async () => {
		const nc = plugin.notechain;
		let tfile = nc.chain.current_note;
		await plugin.export_readme(
			tfile,null,true,plugin.settings.assetsLocalGitProject
		);
	}
});

const cmd_set_git_project = (plugin:VaultExpoterPlugin) => ({
	id: 'set_git_project',
	name: strings.cmd_set_git_project,
	callback: async () => {
		const nc = plugin.notechain;
		let dir = await nc.chain.tp_prompt(strings.prompt_path_of_folder);
		if(!dir || !plugin.fsEditor.fs.existsSync(dir)){
			return;
		}
		await nc.editor.set_frontmatter(
			nc.chain.current_note,
			plugin.settings.nameLocalGitProject,
			dir
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
	cmd_export_readme,
	cmd_set_git_project,
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
		this.app.vt = this;
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
	
	async export_readme(tfile:TFile,dst:string|null,as_readme=true,assets='assets'){
		let nc = (this.app as any).plugins.getPlugin('note-chain');
		if(!tfile){tfile = nc.chain.current_note;}
		
		if(!dst){
			dst = this.settings.nameLocalGitProject;
		}
		if(!dst.contains('/')){
			dst = nc.editor.get_frontmatter(tfile,dst);
		}

		if(!dst){
			dst = await nc.chain.tp_prompt('Path of LocalGitProject');
			if(!dst){return;}
		}
		dst = dst.replace(/\\/g,'/');
		if(!this.fsEditor.fs.existsSync(dst)){
			console.log('No Dir:',dst);
		}
		console.log(dst);
		let olinks = nc.chain.get_outlinks(tfile);
		
		let tmp;
		if(as_readme){
			tmp = dst+'/'+'readMe.md';
		}else{
			tmp = dst+'/'+tfile.basename+'.md';
		}

		this.fsEditor.copy_tfile(tfile,tmp);
		await this.replace_readme(tmp);

		let adir = dst+'/'+assets;
		if(!this.fsEditor.fs.existsSync(adir)){
			this.fsEditor.fs.mkdirSync(adir);
		}
		for(let f of olinks){
			if(!(f.extension==='md')){
				this.fsEditor.copy_tfile(f,adir+'/'+f.basename+'.'+f.extension);
			}
		}
	}
	
	replace_readme(path:string){
		const ufunc = (path:string,data:string)=>{
			let replacedContent = data.replace(
				/\!\[\[(.*?)\]\]/g, 
				(match:any, filename:string) => {
				return `![${filename}](./assets/${filename})`;
			});
			if(this.settings.readmeRemoveFrontmatter){
				replacedContent = replacedContent.replace(
					/---[\n(\r\n)][\s\S]*?---[\n(\r\n)]/,''
				)
			}
			return replacedContent;
		}
		this.fsEditor.modify(path,ufunc,'utf8');
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
		let value = this.plugin.settings[field] as boolean;
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
			.setName('LocalGitProject')
			.setDesc('Metadata Name for Dir of Git Porject')
			.addText(text => text
				.setPlaceholder('Enter your field')
				.setValue(this.plugin.settings.nameLocalGitProject)
				.onChange(async (value) => {
					this.plugin.settings.nameLocalGitProject = value;
					await this.plugin.saveSettings();
				}));
		
		new Setting(containerEl)
			.setName('Folder For Assets')
			.setDesc('Dir Name for Assets')
			.addText(text => text
				.setValue(this.plugin.settings.assetsLocalGitProject)
				.onChange(async (value) => {
					this.plugin.settings.assetsLocalGitProject = value;
					await this.plugin.saveSettings();
				}));
		
		this.add_toggle(
			'Remove Frontmatter?','','readmeRemoveFrontmatter'
		);

		new Setting(containerEl)
			.setName('Plugin Dir To Export')
			.addText(text => text
				.setValue(this.plugin.settings.pluginDirExporter)
				.onChange(async (value) => {
					this.plugin.settings.pluginDirExporter = value;
					await this.plugin.saveSettings();
				}));
		
	}
}

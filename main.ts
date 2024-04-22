import * as Module from 'module';
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

// Remember to rename these classes and interfaces!

const fs = require('fs');

interface VExporterSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: VExporterSettings = {
	mySetting: 'default'
}

export default class VaultExpoterPlugin extends Plugin {
	settings: VExporterSettings;
	root : string;

	async onload() {
		await this.loadSettings();
		this.app.vt = this;
		this.fs = fs;
		this.root = this.app.vault.adapter.basePath;
		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new VExporterSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	* 附件 src 到 dst，不在 vault 中，需要绝对路径
	* overwrite，复盖；mtime，新文件；
	*/
	copy_file_by_path(src:string, dst:string,mode='overwrite>mtime>pass') {
		mode = mode.split('>')[0]
		if(!fs.existsSync(src)){
			return;
		}
		if(fs.existsSync(dst)){
			if(mode==='overwrite'){
				fs.unlinkSync(dst);
				fs.copyFileSync(src,dst);
			}else if(mode==='mtime'){
				// dst 更新时间小于 src
				if(fs.statSync(dst).mtimeMs<fs.statSync(src).mtimeMs){
					fs.unlinkSync(dst);
					fs.copyFileSync(src,dst);
				}
			}
		}else{
			fs.copyFileSync(src,dst);
		}
	}

	abspath(tfile:TFile){
		if(tfile){
			return this.root+'/'+tfile.path;
		}else{
			return null;
		}
	}

	copy_tfile(tfile:TFile, dst:string) {
		if(tfile){
			let src = this.abspath(tfile);
			src && this.copy_file_by_path(src,dst);
		}
	}
	
	async export_readme(tfile:TFile,dst:string|null,as_readme=true,assets='assets'){
		
		let nc = this.app.plugins.getPlugin('note-chain');
		if(!tfile){tfile = nc.chain.current_note;}
		
		if(!dst){
			dst = 'LocalGitProject';
		}
		if(!dst.contains('/')){
			dst = nc.editor.get_frontmatter(tfile,dst);
		}

		if(!dst){
			dst = await nc.chain.tp_prompt('Path of LocalGitProject');
			if(!dst){return;}
		}
		dst = dst.replace(/\\/g,'/');
		if(!fs.existsSync(dst)){
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

		this.copy_tfile(tfile,tmp);

		let adir = dst+'/'+assets;
		if(!fs.existsSync(adir)){
			fs.mkdirSync(adir);
		}
		for(let f of olinks){
			if(!(f.extension==='md')){
				this.copy_tfile(f,adir+'/'+f.basename+'.'+f.extension);
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

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addTextArea(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}

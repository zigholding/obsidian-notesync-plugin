import * as Module from 'module';
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';

import { FsEditor } from 'src/fseditor';
import { Strings } from 'src/strings';
import {MySettings,MySettingTab,DEFAULT_SETTINGS} from 'src/setting'

import { addCommands } from 'src/commands';

export default class NoteSyncPlugin extends Plugin {
	strings : Strings;
	settings: MySettings;
	fsEditor : FsEditor;
	yaml: string;


	async onload() {
		if(this.app.workspace.layoutReady){
			await this._onload_()
		}else{
			this.app.workspace.onLayoutReady(
				async()=>{
					await this._onload_()
				}
			)
		}
	}

	async _onload_() {
		this.yaml = 'note-sync'
		this.strings = new Strings();

		await this.loadSettings();
		this.fsEditor = new FsEditor(this);
		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new MySettingTab(this.app, this));
		addCommands(this);

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				menu.addItem((item) => {
					item
					.setTitle(this.strings.item_sync_vault)
					.setIcon("document")
					.onClick(async () => {
						let dst = await this.fsEditor.select_valid_dir(
							this.settings.vaultDir.split("\n")
						);
						if(!dst){
							let nc= (this.app as any).plugins.getPlugin("note-chain");
							if(!nc){
								new Notice("Plugin note-chain is needed!");
								return;
							}
							dst = await nc.chain.tp_prompt("Root of vault");
							if(!this.fsEditor.isdir(dst)){
								new Notice("Invalid root: " + dst);
								return;
							}
						}
						if(file instanceof TFile){
							this.fsEditor.mirror_tfile(file,dst,'mtime',true,false);

						}else if(file instanceof TFolder){
							this.fsEditor.mirror_tfolder(file,dst,'mtime',true,false);
						}
					});
				});
			})
		);
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
			dst = nc.editor.get_frontmatter(tfile,this.yaml)?.Dir;
			if(!dst){
				dst = await nc.chain.tp_prompt('Path of LocalGitProject');
			}
		}
		if(!dst || !this.fsEditor.fs.existsSync(dst)){
			new Notice(this.strings.notice_nosuchdir,3000);
			return;
		}
		dst = dst.replace(/\\/g,'/');
		
		
		// 导出当前笔记
		let tmp;
		let name = nc.editor.get_frontmatter(tfile,this.yaml)?.Name;
		if(name && !(name==='')){
			tmp = dst+'/'+name+'.md';
		}else{
			tmp = dst+'/'+tfile.basename+'.md';
		}

		if(this.fsEditor.copy_tfile(tfile,tmp)){
			if(nc.editor.get_frontmatter(tfile,this.yaml)?.RemoveMeta){
				const ufunc = (path:string,data:string)=>{
					let res = data;
					if(nc.editor.get_frontmatter(tfile,this.yaml)?.RemoveMeta){
						res = res.replace(
							/---[\n(\r\n)][\s\S]*?---[\n(\r\n)]/,
							''
						)
					}
					if(nc.editor.get_frontmatter(tfile,this.yaml)?.UseGitLink && assets){
						res = res.replace(
							/\!\[\[(.*?)\]\]/g,
							(match:any, name:string) => {
								return `![${name}](${assets}/${name.replace(/ /g,'%20')})`;
							}
						)
					}
					return res
				}
				await this.fsEditor.modify(tmp,ufunc);
			}
		}
		// 导出附件
		let assets = nc.editor.get_frontmatter(tfile,this.yaml)?.Assets;
		if(assets){
			let olinks = nc.chain.get_outlinks(tfile);
			let adir = dst+'/'+assets;
			this.fsEditor.mkdir_recursive(adir);
			for(let f of olinks){
				if(!(f.extension==='md')){
					let flag = this.fsEditor.copy_tfile(f,adir+'/'+f.basename+'.'+f.extension);
					if(flag){
						new Notice(`Copy ${f}`,5000)
					}
				}
			}
		}
	}
}

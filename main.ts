import {Notice, Plugin, TFile, TFolder } from 'obsidian';

import { FsEditor } from 'src/fseditor';
import { Strings } from 'src/strings';
import {MySettings,MySettingTab,DEFAULT_SETTINGS} from 'src/setting'

import { addCommands } from 'src/commands';

import {dialog_suggest} from 'src/gui/inputSuggester'
import {dialog_prompt} from 'src/gui/inputPrompt'

export default class NoteSyncPlugin extends Plugin {
	strings : Strings;
	settings: MySettings;
	fsEditor : FsEditor;
	yaml: string;
	dialog_suggest: Function
	dialog_prompt: Function


	async onload() {
		this.dialog_suggest = dialog_suggest
		this.dialog_prompt = dialog_prompt
		this.app.workspace.onLayoutReady(
			async()=>{
				await this._onload_()
			}
		)
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
							dst = await this.dialog_prompt("Root of vault");
							if(!this.fsEditor.isdir(dst)){
								new Notice("Invalid root: " + dst);
								return;
							}
						}
						if(file instanceof TFile){
							this.fsEditor.sync_tfile(file,dst,'mtime',true,false);

						}else if(file instanceof TFolder){
							this.fsEditor.sync_tfolder(file,dst,'mtime',true,false);
						}
					});
				});
			})
		);
	}

	onunload() {
		
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
	
	async export_readme(tfile:TFile|null,dst:string|null){
		if(!tfile){tfile = this.app.workspace.getActiveFile();}
		if(!tfile){return}

		await this.app.fileManager.processFrontMatter(
			tfile,
			async(fm) =>{

				// set output dir/设置输出目录
				if(!dst){
					dst = fm[this.yaml]?.Dir
					if(!dst){
						dst = await this.dialog_prompt('Path of LocalGitProject');
					}
				}
				
				if(!dst || !this.fsEditor.isdir(dst)){
					new Notice(this.strings.notice_nosuchdir,3000);
					return;
				}
				dst = dst.replace(/\\/g,'/');

				// set target filename/文件名
				let target;
				let name = fm[this.yaml]?.Name;
				if(name && !(name=='')){
					target = dst+'/'+name+'.md';
				}else{
					target = dst+'/'+tfile.basename+'.md';
				}
				
				if(!tfile){return}
				let data = await this.app.vault.cachedRead(tfile)
				if(fm[this.yaml]?.RemoveMeta){
					data = data.replace(
						/---[\n(\r\n)][\s\S]*?---[\n(\r\n)]/,
						''
					)
				}
				let assets = fm[this.yaml]?.Assets

				if(fm[this.yaml]?.UseGitLink && assets){
					data = data.replace(
						/\!\[\[(.*?)\]\]/g,
						(match:any, name:string) => {
							return `![${name}](${assets}/${name.replace(/ /g,'%20')})`;
						}
					)
				}
				await this.fsEditor.fs.writeFile(
					target, data, 'utf-8', 
					(err:Error) => {return;}
				)
				new Notice(`Export to ${target}`,5000)
				if(assets){
					let olinks = this.fsEditor.get_outlinks(tfile,false);
					let adir = this.fsEditor.path.join(dst,assets);
					this.fsEditor.mkdir_recursive(adir);
					for(let f of olinks){
						if(!(f.extension==='md')){
							let flag = this.fsEditor.copy_tfile(f,adir+'/'+f.basename+'.'+f.extension);
							if(flag){
								new Notice(`Copy ${f.name}`,5000)
							}
						}
					}
				}
			}
		)
	}
}

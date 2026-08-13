import {Notice, Plugin, TFile, TFolder } from 'obsidian';

import { Wxmp } from 'src/wxmp';
import { Word } from 'src/word';
import { Feishu } from 'src/feishu';
import { Strings } from 'src/strings';
import {MySettings,NoteSyncSettingTab,DEFAULT_SETTINGS} from 'src/setting'

import { addCommands } from 'src/commands';


export default class NoteSyncPlugin extends Plugin {
	strings : Strings;
	settings: MySettings;
	yaml: string;
	wxmp: Wxmp;
	word: Word;
	feishu: Feishu;


	async onload() {
		this.app.workspace.onLayoutReady(
			async()=>{
				await this._onload_()
			}
		)
	}

	get easyapi(){
		return (window as any).ea;
	}

	async _onload_() {
		this.yaml = 'note-sync'
		this.strings = new Strings();
		

		await this.loadSettings();
		this.wxmp = new Wxmp(this);
		this.word = new Word(this);
		this.feishu = new Feishu(this);
		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new NoteSyncSettingTab(this.app, this));
		addCommands(this);

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				menu.addItem((item) => {
					item
					.setTitle(this.strings.item_sync_vault)
					.setIcon("document")
					.onClick(async () => {
						let dst = await this.easyapi.fs.select_valid_dir(
							this.settings.vaultDir.split("\n")
						);
						if(!dst){
							dst = await this.easyapi.dialog_prompt("Root of vault");
							if(!this.easyapi.fs.isdir(dst)){
								new Notice("Invalid root: " + dst);
								return;
							}
						}
						if(file instanceof TFile){
							this.easyapi.fs.sync_tfile(file,dst,'mtime',true,false);

						}else if(file instanceof TFolder){
							this.easyapi.fs.sync_tfolder(file,dst,'mtime',true,false,this.settings.strict_mode);
						}
					});
				});
				menu.addItem((item) => {
					item
					.setTitle(this.strings.item_upload_feishu)
					.setIcon("cloud-upload")
					.onClick(async () => {
						await this.feishu.uploadFileOrFolder(file);
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

		let mcache = this.app.metadataCache.getFileCache(tfile);
		let ctx = await this.app.vault.read(tfile);

		let fm: { [key: string]: any } = {};
		if(mcache && mcache['frontmatter']){
			fm = mcache['frontmatter'];
		}

		if(!dst){
			dst = fm[this.yaml]?.Dir
			if(!dst){
				dst = await this.easyapi.dialog_prompt('Path of LocalGitProject');
			}
		}

		if(!dst || !this.easyapi.fs.isdir(dst)){
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
		
		if(fm[this.yaml]?.RemoveMeta){
			if(mcache?.frontmatterPosition?.end?.offset){
				ctx = ctx.slice(mcache.frontmatterPosition.end.offset);
			}
		}
		
		let assets = fm[this.yaml]?.Assets

		if(fm[this.yaml]?.UseGitLink && assets){
			
			ctx = ctx.replace(
				/\!\[\[(.*?)\]\]/g, 
				(match, filename) => {
			  		return `![](./${assets}/${filename.replace(/ /g,'%20')})`;
			})
		}
		await this.easyapi.fs.writeFile(
			target, ctx, 'utf-8', 
			(err:Error) => {return;}
		)
		new Notice(`Export to ${target}`,5000)
		if(assets){
			let olinks = this.easyapi.fs.get_outlinks(tfile,false);
			let adir = this.easyapi.fs.path.join(dst,assets);
			this.easyapi.fs.mkdir_recursive(adir);
			for(let f of olinks){
				if(!(f.extension==='md')){
					let flag = this.easyapi.fs.copy_tfile(f,adir+'/'+f.basename+'.'+f.extension);
					if(flag){
						new Notice(`Copy ${f.name}`,5000)
					}
				}
			}
		}
	}
}

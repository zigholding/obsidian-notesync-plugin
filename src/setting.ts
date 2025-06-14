import { 
	App, PluginSettingTab, Setting,Plugin
} from 'obsidian';

import NoteSyncPlugin from '../main';

export interface MySettings {
	strict_mode: boolean;
	vaultDir:string;
	git_repo:string;
}

export const DEFAULT_SETTINGS: MySettings = {
	strict_mode:false,
	vaultDir: '',
	git_repo: 'https://github.com/zigholding/ObsidianZ/tree/master\nhttps://gitee.com/zigholding/ObsidianZ/tree/master'
}

export class NoteSyncSettingTab extends PluginSettingTab {
	plugin: NoteSyncPlugin;
	constructor(app: App, plugin: NoteSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingValue(field: keyof MySettings) {
		return this.plugin.settings[field];
	}

	add_toggle(name:string,desc:string,field:keyof MySettings){
		let {containerEl} = this;
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
				.setName(this.plugin.strings.setting_vault_dir)
				.addTextArea(text => text
					.setValue(this.plugin.settings.vaultDir)
					.onChange(async (value) => {
						this.plugin.settings.vaultDir = value;
						await this.plugin.saveSettings();
					}));
					
		this.add_toggle(
			this.plugin.strings.setting_strict_mode,
			this.plugin.strings.setting_strict_mode_desc,
			'strict_mode'
		);

		new Setting(containerEl)
				.setName(this.plugin.strings.setting_git_repo)
				.addTextArea(text => text
					.setValue(this.plugin.settings.git_repo)
					.onChange(async (value) => {
						this.plugin.settings.git_repo = value;
						await this.plugin.saveSettings();
					}));
	}
}

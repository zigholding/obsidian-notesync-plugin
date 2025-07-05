import { 
	App, PluginSettingTab, Setting,Plugin
} from 'obsidian';

import NoteSyncPlugin from '../main';

export interface MySettings {
	strict_mode: boolean;
	vaultDir:string;
	git_repo:string;
	wxmp_config:string;
}

export const DEFAULT_SETTINGS: MySettings = {
	strict_mode:false,
	vaultDir: '',
	git_repo: 'https://github.com/zigholding/ObsidianZ/tree/master\nhttps://gitee.com/zigholding/ObsidianZ/tree/master',
	wxmp_config: `
h1: ob 公众号标题 h1 样式
h2: ob 公众号标题 h2 样式
h3: ob 公众号标题 hx 样式
p code: ob 公众号行内代码样式
li code: ob 公众号行内代码样式
`.trim()
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
		
		new Setting(containerEl)
			.setName(this.plugin.strings.setting_wxmp_config)
			.addTextArea(text => text
				.setValue(this.plugin.settings.wxmp_config)
				.onChange(async (value) => {
					this.plugin.settings.wxmp_config = value;
					await this.plugin.saveSettings();
				}));
	}
}

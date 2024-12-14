import { 
	App, PluginSettingTab, Setting,Plugin
} from 'obsidian';

import VaultExpoterPlugin from '../main';

export interface VExporterSettings {
	pluginDirExporter:string;
	vaultDir:string;
}

export const DEFAULT_SETTINGS: VExporterSettings = {
	pluginDirExporter:'',
	vaultDir:''
}

export class VExporterSettingTab extends PluginSettingTab {
	plugin: VaultExpoterPlugin;
	constructor(app: App, plugin: VaultExpoterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingValue(field: keyof VExporterSettings) {
		return this.plugin.settings[field];
	}

	add_toggle(name:string,desc:string,field:keyof VExporterSettings){
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
			.setName(this.plugin.strings.setting_plugin_dir)
			.addTextArea(text => text
				.setValue(this.plugin.settings.pluginDirExporter)
				.onChange(async (value) => {
					this.plugin.settings.pluginDirExporter = value;
					await this.plugin.saveSettings();
				}));
		
		new Setting(containerEl)
				.setName(this.plugin.strings.setting_vault_dir)
				.addTextArea(text => text
					.setValue(this.plugin.settings.vaultDir)
					.onChange(async (value) => {
						this.plugin.settings.vaultDir = value;
						await this.plugin.saveSettings();
					}));
	}
}

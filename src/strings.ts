
export class Strings{
    language:string;
    constructor(){
        let lang = window.localStorage.getItem('language');
        if(lang){
            this.language = lang;
        }else{
            this.language = 'en';
        }
	}

    get cmd_export_current_note(){
        if(this.language=='zh'){
            return '导出当前笔记'
        }else{
            return 'Export current note';
        }
    }

    get cmd_set_vexporter(){
        if(this.language=='zh'){
            return '设置导出笔记选项'
        }else{
            return 'Set config to export note';
        }
    }

    get cmd_export_plugin(){
        if(this.language=='zh'){
            return '导出插件'
        }else{
            return 'Export plugin';
        }
    }

    get cmd_download_git_repo(){
        if(this.language=='zh'){
            return '下载 Git 仓库文件'
        }else{
            return 'Download git repo';
        }
    }

    get prompt_path_of_folder(){
        if(this.language=='zh'){
            return '输入文件夹路径'
        }else{
            return 'Input path of folder';
        }
    }

    get notice_output(){
        if(this.language=='zh'){
            return '导出：'
        }else{
            return 'Output:';
        }
    }
    get notice_nosuchdir(){
        if(this.language=='zh'){
            return '无效目录'
        }else{
            return 'Invaid path.';
        }
    }

    get setting_vault_dir(){
        if(this.language=='zh'){
            return '库目录';
        }else{
            return 'Root dir of vault';
        }
    }

    get setting_strict_mode(){
        if(this.language=='zh'){
            return '严格模式?';
        }else{
            return 'Strict mode?';
        }
    }

    get setting_strict_mode_desc(){
        if(this.language=='zh'){
            return '危险！同步时删除目标库中多出的文件';
        }else{
            return 'Danger! Delete files or folders in target vault but not in current vault.';
        }
    }

    get setting_git_repo(){
        if(this.language=='zh'){
            return 'Git 仓库库';
        }else{
            return 'Git repository';
        }
    }

    get item_copy_data_json(){
        if(this.language=='zh'){
            return '复制 data.json';
        }else{
            return 'Copy data.json';
        }
    }

    get item_skip_data_json(){
        if(this.language=='zh'){
            return '跳过 data.json';
        }else{
            return 'Skip data.json';
        }
    }

    get item_sync_vault(){
        if(this.language=='zh'){
            return '同步到其它库';
        }else{
            return 'Sync to other vault';
        }
    }
}

export let strings = new Strings();
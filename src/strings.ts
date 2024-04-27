
class Strings{
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
            return 'Export Current Note';
        }
    }

    get cmd_set_vexporter(){
        if(this.language=='zh'){
            return '设置导出笔记选项'
        }else{
            return 'Set Config to Export Note';
        }
    }

    get cmd_export_plugin(){
        if(this.language=='zh'){
            return '导出插件'
        }else{
            return 'Export Plugin';
        }
    }

    get prompt_path_of_folder(){
        if(this.language=='zh'){
            return '输入文件夹路径'
        }else{
            return 'Input Path of Folder';
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
            return 'Invaid Path.';
        }
    }

    get setting_plugin_dir(){
        if(this.language=='zh'){
            return '插件导出目录';
        }else{
            return 'Plugin Dir To Export';
        }
    }
}

export let strings = new Strings();
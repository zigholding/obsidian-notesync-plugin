
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

    get cmd_export_readme(){
        if(this.language=='zh'){
            return '导出 readMe'
        }else{
            return 'Export readMe';
        }
    }

    get cmd_set_git_project(){
        if(this.language=='zh'){
            return '设置Git项目路径'
        }else{
            return 'Set Dir of Git Project';
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
}

export let strings = new Strings();
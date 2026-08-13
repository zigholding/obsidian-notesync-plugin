
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

    get cmd_export_wxmp(){
        if(this.language=='zh'){
            return '导出微信公众号';
        }else{
            return 'Export wxmp';
        }
    }

    get cmd_export_word(){
        if(this.language=='zh'){
            return '复制为 Word 格式';
        }else{
            return 'Copy as Word';
        }
    }

    get cmd_export_as_single_note(){
        if(this.language=='zh'){
            return '导出多条笔记';
        }else{
            return 'Export notes';
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
            return 'Git 仓库';
        }else{
            return 'Git repository';
        }
    }

    get setting_wxmp_config(){
        if(this.language=='zh'){
            return '微信公众号样式配置';
        }else{
            return 'Style config for wxmp';
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

    get item_upload_feishu(){
        if(this.language=='zh'){
            return '上传到飞书知识库';
        }else{
            return 'Upload to Feishu Wiki';
        }
    }

    get cmd_upload_feishu(){
        if(this.language=='zh'){
            return '上传当前笔记到飞书知识库';
        }else{
            return 'Upload current note to Feishu Wiki';
        }
    }

    get cmd_feishu_test(){
        if(this.language=='zh'){
            return '测试连接';
        }else{
            return 'Test connection';
        }
    }

    get cmd_feishu_pick(){
        if(this.language=='zh'){
            return '选择知识库位置';
        }else{
            return 'Pick Wiki location';
        }
    }

    get prompt_feishu_space(){
        if(this.language=='zh'){
            return '选择飞书知识空间';
        }else{
            return 'Select Feishu Wiki space';
        }
    }

    get item_feishu_use_here(){
        if(this.language=='zh'){
            return '✅ 使用当前目录';
        }else{
            return '✅ Use this folder';
        }
    }

    get setting_feishu_heading(){
        if(this.language=='zh'){
            return '飞书知识库';
        }else{
            return 'Feishu Wiki';
        }
    }

    get setting_feishu_destinations(){
        if(this.language=='zh'){
            return '飞书位置';
        }else{
            return 'Feishu destinations';
        }
    }

    get setting_feishu_destinations_desc(){
        if(this.language=='zh'){
            return 'YAML：每个名称是一个上传位置。可写完整凭证，或用 account 引用另一个位置的 App。同一应用的多个知识库 / 父节点写成多个位置即可。每个父节点都要「添加文档应用」。';
        }else{
            return 'YAML: each name is an upload destination. Put credentials inline, or set account to reuse another block’s App. Multiple wikis/parents are multiple destinations. Add the document app on each parent page.';
        }
    }

    get setting_feishu_destinations_ph(){
        if(this.language=='zh'){
            return '公司:\n  app_id: cli_xxx\n  app_secret: \n  domain: https://xxx.feishu.cn\n\n工作:\n  account: 公司\n  parent: https://xxx.feishu.cn/wiki/wikcn...\n\n产品:\n  account: 公司\n  parent: https://xxx.feishu.cn/wiki/wikcn...';
        }else{
            return 'company:\n  app_id: cli_xxx\n  app_secret: \n  domain: https://xxx.feishu.cn\n\nwork:\n  account: company\n  parent: https://xxx.feishu.cn/wiki/wikcn...\n\nproduct:\n  account: company\n  parent: https://xxx.feishu.cn/wiki/wikcn...';
        }
    }

    get setting_feishu_actions(){
        if(this.language=='zh'){
            return '连接与位置';
        }else{
            return 'Connection';
        }
    }

    get prompt_feishu_dest(){
        if(this.language=='zh'){
            return '选择飞书上传位置';
        }else{
            return 'Select Feishu destination';
        }
    }

    get prompt_feishu_account(){
        if(this.language=='zh'){
            return '选择飞书应用';
        }else{
            return 'Select Feishu app';
        }
    }

    get prompt_feishu_dest_name(){
        if(this.language=='zh'){
            return '保存为位置名称（例如：工作知识库）';
        }else{
            return 'Save as destination name (e.g. Work wiki)';
        }
    }

    get item_feishu_new_dest(){
        if(this.language=='zh'){
            return '＋ 新建位置';
        }else{
            return '+ New destination';
        }
    }

    get item_feishu_legacy_dest(){
        if(this.language=='zh'){
            return '默认';
        }else{
            return 'Default';
        }
    }

    get notice_feishu_yaml_bad(){
        if(this.language=='zh'){
            return '飞书位置 YAML 无法解析，请检查缩进和冒号';
        }else{
            return 'Feishu destinations YAML could not be parsed. Check indentation and colons.';
        }
    }

    get notice_feishu_dest_missing(){
        if(this.language=='zh'){
            return '笔记绑定的飞书位置「{name}」已不在设置中，请补回该位置或删掉 YAML 里的 Feishu.Dest 后重试';
        }else{
            return 'Bound Feishu destination "{name}" is no longer in settings. Restore it, or remove Feishu.Dest from the note YAML and retry.';
        }
    }

    get notice_feishu_no_app(){
        if(this.language=='zh'){
            return '请先在设置的飞书位置 YAML 中填写至少一个 App ID 和 App Secret';
        }else{
            return 'Add at least one App ID and App Secret in the Feishu destinations YAML.';
        }
    }

    get prompt_feishu_wiki_url(){
        if(this.language=='zh'){
            return '看不到知识空间时，请粘贴已「添加文档应用」的知识库页面链接';
        }else{
            return 'If no Wiki space is listed, paste a wiki page URL where the app is a collaborator.';
        }
    }

    get notice_feishu_connected(){
        if(this.language=='zh'){
            return '飞书连接成功，可见知识空间 {n} 个';
        }else{
            return 'Feishu connected. Visible Wiki spaces: {n}';
        }
    }

    get notice_feishu_connected_node(){
        if(this.language=='zh'){
            return '凭证可用，已识别知识库节点「{name}」。空间列表为空也可以按该节点上传。';
        }else{
            return 'Credentials work. Wiki node "{name}" resolved. Upload can use this node even if no spaces are listed.';
        }
    }

    get notice_feishu_no_space(){
        if(this.language=='zh'){
            return '凭证可用，但未识别到知识库节点。请在设置里为该位置填写 parent（已添加文档应用的 wiki 链接），或点「选择知识库位置」。';
        }else{
            return 'Credentials work, but no Wiki node is set. Add a parent wiki URL (where the app is a collaborator) to that destination, or use Pick Wiki location.';
        }
    }

    get notice_feishu_dest_ok(){
        if(this.language=='zh'){
            return '已设置上传位置：{name}';
        }else{
            return 'Upload location set: {name}';
        }
    }

    get notice_feishu_no_dest(){
        if(this.language=='zh'){
            return '未选择飞书知识库位置';
        }else{
            return 'Feishu Wiki location is not set.';
        }
    }

    get notice_feishu_uploading(){
        if(this.language=='zh'){
            return '正在上传到飞书知识库…';
        }else{
            return 'Uploading to Feishu Wiki…';
        }
    }

    get notice_feishu_note_ok(){
        if(this.language=='zh'){
            return '已上传到飞书知识库（链接已复制）\n{url}';
        }else{
            return 'Uploaded to Feishu Wiki (link copied)\n{url}';
        }
    }

    get notice_feishu_note_ok_nolink(){
        if(this.language=='zh'){
            return '已上传到飞书知识库';
        }else{
            return 'Uploaded to Feishu Wiki';
        }
    }

    get notice_feishu_folder_ok(){
        if(this.language=='zh'){
            return '已上传 {n} 篇笔记到飞书知识库';
        }else{
            return 'Uploaded {n} notes to Feishu Wiki';
        }
    }

    get notice_feishu_md_only(){
        if(this.language=='zh'){
            return '仅支持上传 Markdown 笔记或文件夹';
        }else{
            return 'Only Markdown notes or folders can be uploaded.';
        }
    }

    get notice_feishu_too_large(){
        if(this.language=='zh'){
            return '转换后的文档块过多，请拆分笔记后重试';
        }else{
            return 'Too many document blocks after conversion. Split the note and retry.';
        }
    }

    get notice_feishu_fail(){
        if(this.language=='zh'){
            return '飞书上传失败';
        }else{
            return 'Feishu upload failed';
        }
    }
}

export let strings = new Strings();

import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';

export class FsEditor{
    fs;
    path;
    plugin :Plugin;

    constructor(plugin:Plugin){
        this.plugin = plugin;
        this.fs = require('fs');
        this.path = require('path');
    }

    get root(){
        let a = this.plugin.app.vault.adapter as any;
        return a.basePath.replace(/\\/g,'/');
    }

    get notechain(){
        let nc = (this.plugin.app as any).plugins.getPlugin('note-chain');
        return nc
    }


    abspath(tfile:TFile|TFolder){
		if(tfile){
			return (this.root+'/'+tfile.path).replace(/\\/g,'/');
		}else{
			return null;
		}
	}

    isfile(path:string){
        return this.fs.existsSync(path) && this.fs.statSync(path).isFile();
    }

    isdir(path:string){
        return this.fs.existsSync(path) && this.fs.statSync(path).isDirectory();
    }

    list_dir(path:string,as_fullpath=true){
        if(!this.isdir(path)){return []}
        let items = this.fs.readdirSync(path)
        if(as_fullpath){
            items = items.map(
                (x:string)=>{
                    return path+'/'+x
                }
            )
        }   
        return items
    }

    first_valid_dir(paths:Array<string>|string){
        if(typeof(paths)=='string'){
            if(this.isdir(paths)){
                return paths
            }else{
                return null
            }
        }
        for(let path of paths){
            if(this.isdir(path)){
                return path;
            }
        }
        return null;
    }

    async select_valid_dir(paths:Array<string>){
        let xpaths = paths.filter((p:string)=>this.isdir(p));
        if(xpaths.length===0){
            return null;
        }else{
            let nc = (this.plugin.app as any).plugins.getPlugin('note-chain');
            if(nc){
                let path = await nc.chain.tp_suggester(xpaths,xpaths);
                return path;
            }else{
                return null;
            }
        }
    }

    mkdir_recursive(path:string){
        if(this.isdir(path)){return true;}
        let parent = this.path.dirname(path);
        if(!this.isdir(parent)){
            this.mkdir_recursive(parent);
        }
        this.fs.mkdirSync(path);
    }

    /**
	* 附件 src 到 dst，不在 vault 中，需要绝对路径
	* overwrite，复盖；mtime，新文件；
	*/
    copy_file(src:string,dst:string,mode='pass>overwrite>mtime') {
        let fs = this.fs;

        mode = mode.split('>')[0]
        if(!fs.existsSync(src)){
            return false;
        }
        if(fs.existsSync(dst)){
            if(mode==='overwrite'){
                fs.unlinkSync(dst);
                fs.copyFileSync(src,dst);
                return true;
            }else if(mode==='mtime'){
                // dst 更新时间小于 src
                if(fs.statSync(dst).mtimeMs<fs.statSync(src).mtimeMs){
                    fs.unlinkSync(dst);
                    fs.copyFileSync(src,dst);
                    return true;
                }
            }
        }else{
            fs.copyFileSync(src,dst);
            return true;
        }
        return false;
    }

    copy_tfile(tfile:TFile, dst:string,mode='mtime') {
		if(tfile){
			let src = this.abspath(tfile);
			return src && this.copy_file(src,dst,mode);
		}
        return false;
	}

    sync_tfile(tfile:TFile,vault_root:string,mode='mtime',attachment=true,outlink=false){
        // 将笔记镜像移动到别的库中，文件结构与当前库相同
        if(tfile){
            vault_root = vault_root.replace(/\\/g,'/');
			let src = this.root + '/' + tfile.path;
            let dst = vault_root+'/'+tfile.path;
            this.mkdir_recursive(this.path.dirname(dst));
			this.copy_file(src,dst,mode);
            if(attachment){
                let nc = this.notechain;
                if(!nc){return;}
                let tfiles = nc.chain.get_outlinks(tfile,false);
                for(let t of tfiles){
                    if(!(t.extension==='md')){
                        this.sync_tfile(t,vault_root,mode,false);
                    }else if(outlink){
                        this.sync_tfile(t,vault_root,mode,false);
                    }
                }
            }
		}
    }

    sync_tfolder(tfolder:TFolder,vault_root:string,mode='mtime',attachment=true,outlink=false,strict=false){
        if(tfolder){
            for(let t of tfolder.children){
                if(t instanceof TFolder){
                    this.sync_tfolder(t,vault_root,mode,attachment,outlink);
                }else if(t instanceof TFile){
                    this.sync_tfile(t,vault_root,mode,attachment,outlink);
                }
            }
            if(strict){
                let dst = vault_root+'/'+tfolder.path
                let src = this.abspath(tfolder)
                if(src && dst){
                    this.remove_files_not_in_src(src,dst)
                }
            }
		}
    }

    delete_file_or_dir(path:string){
        if(this.isfile(path)){
            this.fs.unlinkSync(path)
        }else if(this.isdir(path)){
            let items = this.list_dir(path,true)
            for(let item of items){
                this.delete_file_or_dir(item)
            }
            this.fs.rmdirSync(path)
        }
    }

    remove_files_not_in_src(src:string,dst:string){
        // 遍历 dst 中所有文件，如果某文件不在src中，删除
        if(!this.isdir(src) || !this.isdir(dst)){return}
        let items = this.list_dir(dst,false)
        for(let item of items){
            let adst = dst+'/'+item
            let asrc = src+'/'+item
            if(this.isfile(adst)){
                if(!this.isfile(asrc)){
                    this.fs.unlinkSync(adst)
                }
            }else if(this.isdir(adst)){
                if(!this.isdir(asrc)){
                    this.delete_file_or_dir(adst)
                }else{
                    this.remove_files_not_in_src(asrc,adst)
                }
            }
        }
    }

    sync_folder(src:string,dst:string,mode='mtime',strict=false){
        if(!this.isdir(src)){return}
        this.mkdir_recursive(dst)
        if(!this.isdir(dst)){return}

        let items = this.list_dir(src,false)
        for(let item of items){
            let asrc = this.path.join(src,item)
            let adst = this.path.join(dst,item)
            if(this.isfile(asrc)){
                this.copy_file(asrc,adst,mode)
            }else if(this.isdir(asrc)){
                this.sync_folder(asrc,adst,mode,strict)
            }
        }
        if(strict){
            this.remove_files_not_in_src(src,dst)
        }
    }

    modify(path:string,callback:Function,encoding='utf8'){
        let fs = this.fs;
        if(!fs.existsSync(path)){return};

        fs.readFile(path, encoding, (err:Error, data:string) => {
			if(err){
                console.error('Error reading file:', err);
            }
            let rs = callback(path,data);
			fs.writeFile(path, rs, encoding, (err:Error) => {
			  if (err) {
				console.error('Error writing file:', err);
			  } else {
				console.log('File content updated successfully.');
			  }
			});
		  }
        );
    }
}
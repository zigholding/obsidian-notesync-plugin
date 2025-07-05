


import { App, View, WorkspaceLeaf,TFile,TFolder } from 'obsidian';

import {EasyAPI} from 'src/easyapi/easyapi'

export class File {
    app: App;
    api: EasyAPI;

    constructor(app: App, api:EasyAPI) {
        this.app = app;
        this.api = api;
    }

    get_tfile(path:string|TFile,only_first=true){
		try{
			if(path instanceof TFile){
				return path;
			}
			path = path.split('|')[0].replace('![[','').replace('[[','').replace(']]','');
			let tfile = this.app.vault.getFileByPath(path)
			if(tfile){
				return tfile;
			}

			let tfiles = (this.app.metadataCache as any).uniqueFileLookup.get(path.toLowerCase());
			if(!tfiles){
				tfiles = (this.app.metadataCache as any).uniqueFileLookup.get(path.toLowerCase()+'.md');
				if(!tfiles){
					return null;
				}else{
					path = path+'.md'
				}
			}

			let ctfiles = tfiles.filter((x:TFile)=>x.name==path)
			if(ctfiles.length>0){
				if(only_first){
					return ctfiles[0]
				}else{
					return ctfiles
				}
			}

			if(tfiles.length>0){
				if(only_first){
					return tfiles[0]
				}else{
					return tfiles
				}
			}
			return null;
		}catch{
			return null
		}
	}

	get_tfiles_of_folder(tfolder:TFolder|null,n=0):any{
		if(!tfolder){return [];}
		let notes = [];
		for(let c of tfolder.children){
			if(c instanceof TFile && c.extension==='md'){
				notes.push(c);
			}else if(c instanceof TFolder && n!=0){
				let tmp = this.get_tfiles_of_folder(c,n-1);
				for(let x of tmp){
					notes.push(x);
				}
			}
		}
		return notes;
	}

    generate_structure(tfolder:TFolder, depth = 0, isRoot = true,only_folder=false,only_md=true) {
        let structure = '';
        const indentUnit = '    '; // 关键修改点：每层缩进 4 空格
        const verticalLine = '│   '; // 垂直连接线密度增强
        const indent = verticalLine.repeat(Math.max(depth - 1, 0)) + indentUnit.repeat(depth > 0 ? 1 : 0);
        const children = tfolder.children || [];
    
        // 显示根目录名称
        if (isRoot) {
            structure += `${tfolder.name}/\n`;
            isRoot = false;
        }
    
        children.forEach((child, index) => {
            const isLast = index === children.length - 1;
            const prefix = isLast ? '└── ' : '├── '; // 统一符号风格
    
            if (child instanceof TFolder) {
                // 目录节点：增加垂直连接线密度
                structure += `${indent}${prefix}${child.name}/\n`;
                structure += this.generate_structure(child, depth + 1, isRoot,only_folder,only_md);
            } else if(!only_folder) {
                // 文件节点：对齐符号与目录
                if(only_md && (child as TFile).extension!='md'){return}
                structure += `${indent}${prefix}${child.name}\n`;
            }
        });
        return structure;
    }
}


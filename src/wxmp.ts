
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';
import NoteSyncPlugin from "../main";
import { on } from 'node:events';

export class Wxmp {
    marked: any;
    hljs: any;
    app: App;
    plugin: NoteSyncPlugin;

    constructor(plugin: NoteSyncPlugin) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.marked = require('marked');
        this.hljs = require('highlight.js');
    }

    get ctx_map(){
        let config:{[key:string]:any} = {};
        for(let line of this.plugin.settings.wxmp_config.split('\n')){
            let [key, value] = line.split(':');
            if(!key || !value){continue}
            key = key.trim();
            value = value.trim();
            if(!key || !value){continue}
            config[key] = value;
        }
        if(!config['h1']){
            config['h1'] = this.format_wxmp_h1;
        }
        if(!config['h2']){
            config['h2'] = this.format_wxmp_h2;
        }
        if(!config['h3']){
            config['h3'] = this.format_wxmp_h3;
        }
        if(!config['p code']){
            config['p code'] = this.format_wxmp_p_code;
        }
        if(!config['li code']){
            config['li code'] = this.format_wxmp_li_code;
        }
        return config;
    }

    arrayBufferToBase64(buffer: ArrayBuffer) {
        let binary = '';
        let bytes = new Uint8Array(buffer);
        let len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    async read_html_from_clipboard(mime = 'text/html') {
        let ctxs = await navigator.clipboard.read()

        for (let ctx of ctxs) {
            let blob = await ctx.getType(mime)
            let html = await blob.text()
            return html
        }
    }

    async replace_regx_with_tpl(rhtml:string, regx:RegExp, tpl:string) {
        let matches = [...rhtml.matchAll(regx)];

        let replacements = await Promise.all(
            matches.map(async ([match, title]) => {
                let msg = await this.plugin.easyapi.tpl.parse_templater(tpl, true, title);
                return { match, replacement: msg[0] };
            })
        );

        // 逐个替换
        for (let { match, replacement } of replacements) {
            rhtml = rhtml.replace(match, replacement);
        }

        return rhtml;
    }

    convertVaultImageLinksToImgTag(htmlString:string) {
        return htmlString.replace(/!\[\[([^\]]+?)\]\]/g, (match, filename) => {
            return `<img src="${filename.trim()}">`;
        });
    }

    async convertImageTagsToBase64(htmlString:string) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');

        const imgElements = doc.querySelectorAll('img');

        for (let img of Array.from(imgElements)) {
            let src = img.getAttribute('src');
            if (!src) continue;

            // 只处理 vault 中的本地图片
            let fname = decodeURIComponent(src.replace(/^.*[\\\/]/, ''));

            try {
                let base64 = await this.image_to_img(fname, true); // 返回 base64
                if (base64) {
                    img.setAttribute('src', base64);
                }
            } catch (e) {
                console.warn(`图片 ${src} 转换失败:`, e);
            }
        }

        return new XMLSerializer().serializeToString(doc.body);
    }


    async html_to_wxmp(html:string) {
        let rhtml;

        // 替换图片
        rhtml = this.convertVaultImageLinksToImgTag(html);
        rhtml = await this.convertImageTagsToBase64(rhtml);
        // 替换链接
        rhtml = this.html_replace_url(rhtml);

        // 替换代码
        rhtml = this.html_replace_code(rhtml)

        // 替换标题
        for (let k in this.ctx_map) {
            rhtml = await this.set_tag_with_tpl(rhtml, k, this.ctx_map[k]);
        }

        // [[格式化图片链接]]
        rhtml = this.formatWeChatImageLink(rhtml)

        // 列表最后一个元素段后距设置为 24px
        rhtml = this.setLastLiMargin(rhtml)
        // 列表之前一个元素段后距设置为 8px
        rhtml = this.setParagraphSpacingBeforeList(rhtml)
        return rhtml
    }

    async set_tag_with_tpl(htmlString:string, selector:string, tpl:string|Function) {
        let parser = new DOMParser();
        let doc = parser.parseFromString(htmlString, 'text/html');
        let items = doc.querySelectorAll(selector);

        await Promise.all(Array.from(items).map(async (item) => {
            let content = item.textContent;

            if(typeof tpl == 'function'){
                let rendered = tpl(content);
                if(rendered){
                    item.innerHTML = rendered;
                }
            }else{
                // 模板渲染，传入content
                let rendered = await this.plugin.easyapi.tpl.parse_templater(tpl, true, content);
                if (rendered.length > 0) {
                    item.innerHTML = rendered[0];
                }
            }
        }));

        // 序列化回字符串
        let serializer = new XMLSerializer();
        let modifiedHtmlString = serializer.serializeToString(doc.body);
        return modifiedHtmlString;
    }


    setLastLiMargin(htmlString:string) {
        let parser = new DOMParser();
        let doc = parser.parseFromString(htmlString, 'text/html');

        let lists = doc.querySelectorAll('ol, ul');

        lists.forEach(list => {
            let lis = list.querySelectorAll('li');
            if (lis.length > 0) {
                let lastLi = lis[lis.length - 1];

                // 保留原始内容，包裹一个section加margin
                let originalHTML = lastLi.innerHTML;
                lastLi.innerHTML = `
        <section style="margin-bottom: 24px;">
          ${originalHTML}
        </section>
      `;
            }
        });

        let serializer = new XMLSerializer();
        return serializer.serializeToString(doc.body);
    }


    setParagraphSpacingBeforeList(htmlString:string) {
        // 创建一个新的DOM解析器
        let parser = new DOMParser();
        // 将HTML字符串解析为文档对象
        let doc = parser.parseFromString(htmlString, 'text/html');

        // 获取文档中的所有有序列表和无序列表
        let lists = doc.querySelectorAll('ol, ul');

        lists.forEach(list => {
            // 找到列表前面的第一个段落
            let precedingParagraph = list.previousElementSibling;
            if (precedingParagraph && precedingParagraph.tagName.toLowerCase() === 'p') {
                // 设置段后距为8px
                (precedingParagraph as any).style.marginBottom = '8px';
            }
        });

        // 将修改后的文档对象转换回HTML字符串
        let serializer = new XMLSerializer();
        let modifiedHtmlString = serializer.serializeToString(doc.body);

        return modifiedHtmlString;
    }

    html_replace_url(html:string) {
        let regx = /<a[^>]*class="external-link"[^>]*href="(.*?)"[^>]*?>([\s\S]*?)<\/a>/g
        let rhtml = html.replace(regx, (m, href, text) => {

            let flag = false
            for (let url of [
                'https://mmbiz.qpic.cn',
                'https://mp.weixin.qq.com'
            ]) {
                if (href.trim().startsWith(url)) {
                    flag = true
                    break
                }
            }
            if (!flag) {
                return `<a>${text}</a>`
            }
            return `<a href="${href}" textvalue="${text}" data-itemshowtype="0" target="_blank" linktype="text" data-linktype="2">${text}</a>`
        })
        return rhtml
    }


    html_replace_code(html:string) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const codeBlocks = Array.from(doc.querySelectorAll('pre > code[class^="language-"]'));

        codeBlocks.forEach(preCode => {
            const langMatch = preCode.className.match(/language-(\w+)/);
            const lang = langMatch ? langMatch[1] : 'plaintext';
            const rawCode = preCode.textContent;

            let result;
            try {
                result = this.hljs.highlight(rawCode, { language: lang });
            } catch (e) {
                console.warn(`高亮失败: ${lang}`, e);
                return;
            }

            // 替换 class 为公众号 class
            const classPairs = [
                ['hljs-keyword', 'code-snippet__keyword'],
                ['hljs-attr', 'code-snippet__attr'],
                ['hljs-string', 'code-snippet__string'],
                ['hljs-number', 'code-snippet__number'],
                ['hljs-comment', 'code-snippet__comment'],
                ['hljs-title', 'code-snippet__title'],
                ['hljs-variable', 'code-snippet__variable'],
                ['hljs-operator', 'code-snippet__operator'],
                ['hljs-punctuation', 'code-snippet__punctuation'],
            ];
            let highlightedHtml = result.value;
            for (let [from, to] of classPairs) {
                highlightedHtml = highlightedHtml.replaceAll(from, to);
            }

            const lines = highlightedHtml.split('\n');

            // 构造 section 容器
            const section = doc.createElement('section');
            section.className = `code-snippet__fix code-snippet__${lang}`;

            // 构造行号
            const ul = doc.createElement('ul');
            ul.className = `code-snippet__line-index code-snippet__${lang}`;
            lines.forEach(() => ul.appendChild(doc.createElement('li')));
            section.appendChild(ul);

            // 构造代码主体
            const pre = doc.createElement('pre');
            pre.className = `code-snippet__${lang}`;
            pre.setAttribute('data-lang', lang);

            lines.forEach((line: string) => {
                const codeLine = doc.createElement('code');
                const span = doc.createElement('span');
                span.setAttribute('leaf', '');
                span.innerHTML = line.trim() === '' ? '<br>' : line;
                codeLine.appendChild(span);
                pre.appendChild(codeLine);
            });

            section.appendChild(pre);

            // 隐藏的 mp-style-type
            const mpStyleP = doc.createElement('p');
            mpStyleP.setAttribute('style', 'display: none;');
            mpStyleP.innerHTML = `<mp-style-type data-value="3"></mp-style-type>`;

            // 替换原来的 <pre>
            const preElement = preCode.parentElement;
            if (preElement) {
                preElement.replaceWith(section, mpStyleP);
            }
        });

        return new XMLSerializer().serializeToString(doc.body);
    }


    async image_to_img(fname: string, as_base64 = false) {
        if (fname.startsWith('!')) {
            fname = fname.slice(1)
        }
        let img_ext = ['png', 'jpg', 'jpeg']
        let tfile = this.plugin.easyapi.file.get_tfile(fname)
        if (!tfile) { return }
        let ext = tfile.extension.toLowerCase()
        if (!img_ext.contains(ext)) { return }
        let data = await this.app.vault.readBinary(tfile)
        let text = this.arrayBufferToBase64(data);

        let bs64 = `data:image/png;base64,${text}`
        if (as_base64) {
            return bs64;
        }
        let html = `<img src="${bs64}">`
        return html
    }

    async copy_as_html(ctx: string | string[]) {
        if (typeof (ctx) == 'string') {
            ctx = [ctx]
        }
        let data = new ClipboardItem({
            "text/html": new Blob(ctx, {
                type: "text/html"
            }),
            "text/plain": new Blob(ctx, {
                type: "text/plain"
            }),
        });
        await navigator.clipboard.write([data]);
    }

    formatWeChatImageLink(inputHtml:string) {
        // 创建一个临时的 div 元素来解析 HTML
        let tempDiv = document.createElement('div');
        tempDiv.innerHTML = inputHtml;

        // 获取所有的 <a> 标签
        let aTags = tempDiv.querySelectorAll('a');

        // 遍历所有的 <a> 标签
        aTags.forEach(aTag => {
            let imgTag = aTag.querySelector('img');

            if (imgTag) {
                // 提取 href 和 src
                let href = aTag.getAttribute('href');
                let src = imgTag.getAttribute('src');

                // 获取图片格式（如 png, jpg, gif 等）
                let imgFormat = src?.split('.').pop();

                // 构建新的 HTML
                let newHtml = `
					<a href="${href}" imgurl="${src}?wx_fmt=${imgFormat}&amp;from=appmsg" linktype="image" tab="innerlink" data-itemshowtype="" target="_blank" data-linktype="1">
						<span class="js_jump_icon h5_image_link">
							<img data-src="${src}?wx_fmt=${imgFormat}&amp;from=appmsg" class="rich_pages wxw-img" data-ratio="0.18611111111111112" data-s="300,640" data-type="${imgFormat}" data-w="1080" type="block" data-imgfileid="100005308" src="${src}?wx_fmt=${imgFormat}&amp;from=appmsg">
						</span>
					</a>
				`;

                // 替换原始的 <a> 标签
                aTag.outerHTML = newHtml;
            }
        });

        // 返回格式化后的 HTML
        return tempDiv.innerHTML;
    }

    format_wxmp_h1(title:string){
        let css = `
        <h1 style="box-sizing: border-box; border-width: 0px 0px 2px; border-style: solid; border-bottom-color: rgb(0, 152, 116); font-size: 19.6px; font-weight: bold; margin: 2em auto 1em; text-align: center; line-height: 1.75; font-family: Menlo, Monaco, &quot;Courier New&quot;, monospace; display: table; padding: 0.5em 1em; color: rgb(63, 63, 63); text-shadow: rgba(0, 0, 0, 0.1) 2px 2px 4px; visibility: visible;"><span leaf="" style="visibility: visible;">${title}</span></h1>
        `.trim()
        return css;
    }

    format_wxmp_h2(title:string){
        let css = `
        <h2 style="box-sizing: border-box;border-width: 0px;border-style: solid;border-color: hsl(var(--border));font-size: 18.2px;font-weight: bold;margin: 4em auto 2em;text-align: center;line-height: 1.75;font-family: Menlo, Monaco, &quot;Courier New&quot;, monospace;display: table;padding: 0.3em 1em;color: rgb(255, 255, 255);background: rgb(0, 152, 116);border-radius: 8px;box-shadow: rgba(0, 0, 0, 0.1) 0px 4px 6px;"><span leaf="">${title}</span></h2>
        `.trim()
        return css;
    }

    format_wxmp_h3(title:string){
        let css = `
        <h3 style="box-sizing: border-box;border-width: 0px 0px 1px 4px;border-style: solid solid dashed;border-bottom-color: rgb(0, 152, 116);border-left-color: rgb(0, 152, 116);font-size: 16.8px;font-weight: bold;margin: 2em 8px 0.75em 0px;text-align: left;line-height: 1.2;font-family: Menlo, Monaco, &quot;Courier New&quot;, monospace;padding-left: 12px;color: rgb(63, 63, 63);"><span leaf="">${title}</span></h3>
        `.trim()
        return css;
    }

    format_wxmp_p_code(code:string){
        let css = `
        <code style="box-sizing: border-box; border-width: 0px; border-style: solid; border-color: hsl(var(--border)); font-family: -apple-system-font, BlinkMacSystemFont, &quot;Helvetica Neue&quot;, &quot;PingFang SC&quot;, &quot;Hiragino Sans GB&quot;, &quot;Microsoft YaHei UI&quot;, &quot;Microsoft YaHei&quot;, Arial, sans-serif; font-feature-settings: normal; font-variation-settings: normal; font-size: 12.6px; text-align: left; line-height: 1.75; color: rgb(221, 17, 68); background: rgba(27, 31, 35, 0.05); padding: 3px 5px; border-radius: 4px; visibility: visible;"><span leaf="" style="visibility: visible;">${code}</span></code>`.trim()
        return css;
    }

    format_wxmp_li_code(code:string){
        let css = `
        <code style="box-sizing: border-box; border-width: 0px; border-style: solid; border-color: hsl(var(--border)); font-family: -apple-system-font, BlinkMacSystemFont, &quot;Helvetica Neue&quot;, &quot;PingFang SC&quot;, &quot;Hiragino Sans GB&quot;, &quot;Microsoft YaHei UI&quot;, &quot;Microsoft YaHei&quot;, Arial, sans-serif; font-feature-settings: normal; font-variation-settings: normal; font-size: 12.6px; text-align: left; line-height: 1.75; color: rgb(221, 17, 68); background: rgba(27, 31, 35, 0.05); padding: 3px 5px; border-radius: 4px; visibility: visible;"><span leaf="" style="visibility: visible;">${code}</span></code>`.trim()
        return css;
    }
}

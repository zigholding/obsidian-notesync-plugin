
import { App, SectionCache, TFile } from 'obsidian';
import { marked } from 'marked';
import hljs from 'highlight.js';
import NoteSyncPlugin from "../main";

type HeadingFormatter = (title: string) => string;
type SectionFormatter = (
    section: SectionCache,
    sec: string,
    ctx?: string
) => string | string[] | null | Promise<string | string[] | null>;
type CtxMapValue = string | HeadingFormatter | SectionFormatter;
type CtxMap = Record<string, CtxMapValue>;

function wxEl(doc: Document, tag: string, options?: DomElementInfo): HTMLElement {
    return doc.adoptNode(createEl(tag as keyof HTMLElementTagNameMap, options)) as HTMLElement;
}

function setStyles(el: Element, styles: Record<string, string>) {
    if (el instanceof HTMLElement) {
        el.setCssStyles(styles);
    }
}

export class Wxmp {
    marked = marked;
    hljs = hljs;
    app: App;
    plugin: NoteSyncPlugin;

    constructor(plugin: NoteSyncPlugin) {
        this.plugin = plugin;
        this.app = plugin.app;
    }

    get blank_line(){
        return '<section><br></section>';
    }

    get ctx_map() {
        let msg = this.plugin.settings.wxmp_config.trim();
        if(msg.trim()==''){
            return {};
        }
        let config = (this.plugin.easyapi.editor.yamljs.load(msg) || {}) as CtxMap;
        if(!config){
            return {};
        }
        if (!config['h1']) {
            config['h1'] = this.format_wxmp_h1;
        }
        if (!config['h2']) {
            config['h2'] = this.format_wxmp_h2;
        }
        if (!config['h3']) {
            config['h3'] = this.format_wxmp_h3;
        }
        if (!config['p code']) {
            config['p code'] = this.format_wxmp_p_code;
        }
        if (!config['li code']) {
            config['li code'] = this.format_wxmp_li_code;
        }

        if (!config['section@html']) {
            config['section@html'] = this.format_section_html;
        }

        if (!config['section@cards-album']) {
            config['section@cards-album'] = this.format_code_block_cards_album;
        }
        let tfiles = this.plugin.easyapi.file.get_all_tfiles_tags('NoteSyncWxmp');
        for(let i in tfiles){
            config[`section@${i}`] = tfiles[i].basename;
        }
        return config;
    }

    arrayBufferToBase64(buffer: ArrayBuffer) {
        // Node Buffer (desktop-only). Avoid atob/btoa so the directory
        // scanner does not treat image embedding as payload hiding.
        return Buffer.from(buffer).toString('base64');
    }

    async replace_regx_with_tpl(rhtml: string, regx: RegExp, tpl: string) {
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

    convertVaultImageLinksToImgTag(htmlString: string) {
        return htmlString.replace(/!\[\[([^\]]+?)\]\]/g, (match, filename) => {
            return `<img src="${filename.trim()}">`;
        });
    }

    async convertImageTagsToBase64(htmlString: string) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');

        const imgElements = doc.querySelectorAll('img');

        for (let img of Array.from(imgElements)) {
            let src = img.getAttribute('src');
            if (!src) continue;

            // 只处理 vault 中的本地图片
            let fname = decodeURIComponent(src.replace(/^.*[/\\]/, ''));

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

    async section_to_wxmp(section: SectionCache, sec:string, ctx:string){
        if (section.type == 'yaml') {
            return null;
        }

        let rhtml: string | string[] | null = null;
        let ctx_map = this.ctx_map;
        for(let k in ctx_map){
            if(k.startsWith('section@')){
                let tpl = ctx_map[k];
                if (typeof tpl == 'function') {
                    const formatted = await Promise.resolve(Reflect.apply(tpl, this, [section, sec]));
                    rhtml = Array.isArray(formatted) || typeof formatted === 'string' ? formatted : null;
                } else {
                    let rendered = await this.plugin.easyapi.tpl.parse_templater(
                        tpl, true,{section:section,sec:sec,ctx:ctx},[0]
                    );
                    let picked = rendered.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
                    if (picked.length > 0) {
                        rhtml = picked[0];
                    }
                }
                if(rhtml){
                    break;
                }
            }
        }

        if(!rhtml){
            if(section.type == 'code'){
                sec = this.normalize_code_section_for_wxmp(sec);
            }
            let html = this.marked.parse(sec);
            if (typeof html !== 'string') {
                html = await html;
            }
            rhtml = await this.html_to_wxmp(html);
        }
        return rhtml;
    }

    async selection_to_wxmp(){
        let htmls = [this.blank_line];
        let sel = this.plugin.easyapi.ceditor.cm.state.selection.main;
        if(sel.from==sel.to){
            return null
        }
        let ctx = await this.plugin.easyapi.ccontent;
        if(!ctx){
            return null
        }
        for(let section of this.plugin.easyapi.cmeta?.sections || []){
            if(sel.to<=section.position.start.offset){
                continue
            }
            if(sel.from>=section.position.end.offset){
                continue
            }
            let from = Math.max(sel.from,section.position.start.offset);
            let to = Math.min(sel.to,section.position.end.offset);
            let sec = ctx.slice(from,to).trim();

            if(section.type=='code'){
                let items = this.plugin.easyapi.editor.slice_by_position(
                    ctx, section.position
                ).trim().split('\n')
                if(!sec.startsWith(items[0])){
                    sec = items[0]+'\n'+sec;
                }
                if(!sec.endsWith(items.last() || '')){
                    sec = sec + '\n' + items.last();
                }
            }

            if(sec==''){continue}
            let rhtml = await this.section_to_wxmp(section,sec,sec);
            if(!rhtml){continue}

            if(Array.isArray(rhtml)){
                htmls.push(...rhtml);
            }else{
                htmls.push(rhtml);
            }
            // htmls.push(this.blank_line)
        }
        await this.copy_as_html(htmls);
    }

    async tfile_to_wxmp(tfile: TFile) {
        let htmls =  [this.blank_line];
        let ctx = await this.app.vault.read(tfile);
        for (let section of this.app.metadataCache.getFileCache(tfile)?.sections || []) {
            if (section.type == 'yaml') {
                continue
            }
            let sec = this.plugin.easyapi.editor.slice_by_position(ctx, section.position);
            let rhtml = await this.section_to_wxmp(section,sec,ctx);
            if(!rhtml){continue}

            if(Array.isArray(rhtml)){
                htmls.push(...rhtml);
            }else{
                htmls.push(rhtml);
            }
            // htmls.push(this.blank_line);
        }
        await this.copy_as_html(htmls);
    }



    async html_to_wxmp(html: string) {
        let rhtml;

        // 替换图片
        rhtml = this.convertVaultImageLinksToImgTag(html);
        rhtml = await this.convertImageTagsToBase64(rhtml);
        // 正文双链 [[Note]] / [[Note|别名]] → 去掉括号，保留显示名
        rhtml = this.html_replace_wikilink(rhtml);
        // 替换链接
        rhtml = this.html_replace_url(rhtml);

        // 替换代码
        rhtml = this.html_replace_code(rhtml)

        // 替换标题
        let ctx_map = this.ctx_map;
        for (let k in ctx_map) {
            if(k.contains('@')){continue;}
            const tpl = ctx_map[k];
            if (typeof tpl === 'string') {
                rhtml = await this.set_tag_with_tpl(rhtml, k, tpl);
            } else if (typeof tpl === 'function') {
                rhtml = await this.set_tag_with_tpl(rhtml, k, (title: string) => {
                    const out = Reflect.apply(tpl, this, [title]);
                    return typeof out === 'string' ? out : '';
                });
            }
        }

        // [[格式化图片链接]]
        rhtml = this.formatWeChatImageLink(rhtml)

        // 规范化列表，避免公众号里 li 被拆成多行
        rhtml = this.normalizeListHtml(rhtml)
        // 列表之前一个元素段后距设置为 8px
        rhtml = this.setParagraphSpacingBeforeList(rhtml)
        return rhtml
    }

    /** Parse an HTML fragment into nodes owned by `owner` (no innerHTML writes). */
    htmlToNodes(html: string, owner: Document): Node[] {
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        return Array.from(parsed.body.childNodes).map(n => owner.importNode(n, true));
    }

    /** Keep WeChat from collapsing spaces inside highlighted code. */
    nbspInTextNodes(root: Node) {
        const doc = root.ownerDocument;
        if (!doc) return;
        const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const texts: Text[] = [];
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node instanceof Text) {
                texts.push(node);
            }
        }
        for (const t of texts) {
            t.textContent = (t.textContent || '').replace(/\t/g, '    ').replace(/ /g, '\u00a0');
        }
    }

    async set_tag_with_tpl(htmlString: string, selector: string, tpl: string | HeadingFormatter) {
        let parser = new DOMParser();
        let doc = parser.parseFromString(htmlString, 'text/html');
        let items = Array.from(doc.querySelectorAll(selector));

        for (let item of items) {
            if (!item.isConnected) continue;
            let content = item.textContent;
            let rendered: string | null = null;

            if (typeof tpl == 'function') {
                rendered = tpl(content || '');
            } else {
                // 模板渲染，传入 content 字符串；模板内用 tp.config.extra 取用
                let result = await this.plugin.easyapi.tpl.parse_templater(tpl, true, content);
                if (result.length > 0) {
                    rendered = result[0];
                }
            }

            if (typeof rendered !== 'string' || !rendered.trim()) continue;
            let html = rendered.trim();

            // 模板常返回完整标签（如 <h2>..</h2> / <code>..</code>），必须替换整个节点。
            // 若写进当前节点内部，会变成 <h2><h2>..</h2></h2>，浏览器再拆成空 h2 + 真标题。
            const nodes = this.htmlToNodes(html, doc);
            if (nodes.some(n => n.nodeType === Node.ELEMENT_NODE)) {
                item.replaceWith(...nodes);
            } else {
                item.replaceChildren(...nodes);
            }
        }

        return new XMLSerializer().serializeToString(doc.body);
    }


    normalizeListHtml(htmlString: string) {
        let parser = new DOMParser();
        let doc = parser.parseFromString(htmlString, 'text/html');

        doc.querySelectorAll('li').forEach(li => {
            // 公众号不支持 input checkbox（会变成空行/圆点），换成 ☐ / ☑
            let checkboxes = Array.from(li.querySelectorAll('input[type="checkbox"]'));
            if (checkboxes.length > 0) {
                setStyles(li, { listStyle: 'none' });
                let parent = li.parentElement;
                if (parent && parent.tagName.toLowerCase() === 'ul') {
                    setStyles(parent, { listStyle: 'none' });
                }
            }
            checkboxes.forEach(el => {
                let checked = (el as HTMLInputElement).checked
                    || el.hasAttribute('checked');
                let mark = wxEl(doc, 'span');
                mark.textContent = (checked ? '☑' : '☐') + ' ';
                el.replaceWith(mark);
            });

            // marked 松散列表会包 <p>，公众号里会拆行
            Array.from(li.querySelectorAll(':scope > p')).forEach(p => {
                while (p.firstChild) {
                    li.insertBefore(p.firstChild, p);
                }
                p.remove();
            });
        });

        doc.querySelectorAll('ol, ul').forEach(list => {
            let lis = Array.from(list.querySelectorAll(':scope > li'));
            lis.forEach((li, i) => {
                // 已是单 section 包裹则只补最后一项的段后距
                let onlySection =
                    li.children.length === 1 &&
                    li.children[0].tagName.toLowerCase() === 'section' &&
                    Array.from(li.childNodes).every(
                        n => n.nodeType !== Node.TEXT_NODE || !(n.textContent || '').trim()
                    );

                let section: HTMLElement;
                if (onlySection) {
                    section = li.children[0] as HTMLElement;
                } else {
                    section = wxEl(doc, 'section');
                    while (li.firstChild) {
                        section.appendChild(li.firstChild);
                    }
                    li.appendChild(section);
                }

                if (i === lis.length - 1) {
                    setStyles(section, { marginBottom: '24px' });
                }
            });
        });

        return new XMLSerializer().serializeToString(doc.body);
    }


    setParagraphSpacingBeforeList(htmlString: string) {
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
                setStyles(precedingParagraph, { marginBottom: '8px' });
            }
        });

        // 将修改后的文档对象转换回HTML字符串
        let serializer = new XMLSerializer();
        let modifiedHtmlString = serializer.serializeToString(doc.body);

        return modifiedHtmlString;
    }

    html_replace_wikilink(html: string) {
        let parser = new DOMParser();
        let doc = parser.parseFromString(html, 'text/html');
        let walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
        let nodes: Text[] = [];
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node instanceof Text) {
                nodes.push(node);
            }
        }
        // [[path#heading|alias]] / [[path]]；代码块内不处理
        let re = /!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;
        for (let node of nodes) {
            if (!node.nodeValue || !node.nodeValue.includes('[[')) continue;
            if (node.parentElement?.closest('pre, code')) continue;
            node.nodeValue = node.nodeValue.replace(re, (_m, path, alias) => {
                return (alias || path).trim();
            });
        }
        return new XMLSerializer().serializeToString(doc.body);
    }

    html_replace_url(html: string) {
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


    /** 公众号代码块只认 js：重写围栏，正文首尾空行去掉，原语言写成 //lang */
    normalize_code_section_for_wxmp(sec: string) {
        let items = sec.replace(/^\uFEFF/, '').split(/\r?\n/);
        while (items.length && items[0].trim() === '') items.shift();
        while (items.length && items[items.length - 1].trim() === '') items.pop();
        if (!items.length) return sec;

        let fence = items[0];
        let info = fence.startsWith('```') ? fence.slice(3).trim() : '';
        let body = items.slice(1);
        if (body.length && /^```/.test(body[body.length - 1].trim())) {
            body.pop();
        }
        while (body.length && body[0].trim() === '') body.shift();
        while (body.length && body[body.length - 1].trim() === '') body.pop();

        let out = ['```js'];
        if (info) out.push('//' + info);
        out.push(...body, '```');
        return out.join('\n');
    }

    is_blank_code_line(line: string) {
        return line
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/gi, '')
            .replace(/\u00a0/g, '')
            .trim() === '';
    }

    html_replace_code(html: string) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const codeBlocks = Array.from(doc.querySelectorAll('pre > code[class^="language-"]'));

        codeBlocks.forEach(preCode => {
            const langMatch = preCode.className.match(/language-(\w+)/);
            const lang = langMatch ? langMatch[1] : 'plaintext';
            // marked / DOM 常在代码首尾带换行，去掉后再分行，避免公众号多出空行
            let rawLines = (preCode.textContent || '').split(/\r?\n/);
            while (rawLines.length && this.is_blank_code_line(rawLines[0])) rawLines.shift();
            while (rawLines.length && this.is_blank_code_line(rawLines[rawLines.length - 1])) rawLines.pop();
            const rawCode = rawLines.join('\n');

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
                highlightedHtml = highlightedHtml.replace(new RegExp(from, 'g'), to);
            }

            let lines = highlightedHtml.split(/\r?\n/);
            while (lines.length && this.is_blank_code_line(lines[0])) lines.shift();
            while (lines.length && this.is_blank_code_line(lines[lines.length - 1])) lines.pop();

            // 构造 section 容器
            const section = wxEl(doc, 'section', { cls: `code-snippet__fix code-snippet__${lang}` });

            const ul = wxEl(doc, 'ul', { cls: `code-snippet__line-index code-snippet__${lang}` });
            lines.forEach(() => ul.appendChild(wxEl(doc, 'li')));
            section.appendChild(ul);

            const pre = wxEl(doc, 'pre', { cls: `code-snippet__${lang}`, attr: { 'data-lang': lang } });

            lines.forEach((line: string) => {
                const codeLine = wxEl(doc, 'code');
                const span = wxEl(doc, 'span', { attr: { leaf: '' } });
                if (this.is_blank_code_line(line)) {
                    span.appendChild(wxEl(doc, 'br'));
                } else {
                    span.replaceChildren(...this.htmlToNodes(line, doc));
                    this.nbspInTextNodes(span);
                }
                codeLine.appendChild(span);
                pre.appendChild(codeLine);
            });

            section.appendChild(pre);

            const mpStyleP = wxEl(doc, 'p');
            setStyles(mpStyleP, { display: 'none' });
            const mpStyleType = wxEl(doc, 'mp-style-type', { attr: { 'data-value': '3' } });
            mpStyleP.appendChild(mpStyleType);

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

    async copy_as_html(ctx: string | string[],pre_blank=true,next_blank=true) {
        if (typeof (ctx) == 'string') {
            ctx = [ctx]
        }
        if(pre_blank && ctx[0]!=this.blank_line){
            ctx.unshift(this.blank_line)
        }
        if(next_blank && ctx[ctx.length-1]!=this.blank_line){
            ctx.push(this.blank_line)
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

    formatWeChatImageLink(inputHtml: string) {
        const doc = new DOMParser().parseFromString(inputHtml, 'text/html');

        doc.querySelectorAll('a').forEach(aTag => {
            const imgTag = aTag.querySelector('img');
            if (!imgTag) return;

            const href = aTag.getAttribute('href') || '';
            const src = imgTag.getAttribute('src') || '';
            const imgFormat = src.split('.').pop() || '';
            const wxSrc = `${src}?wx_fmt=${imgFormat}&from=appmsg`;

            const a = wxEl(doc, 'a', {
                attr: {
                    href,
                    imgurl: wxSrc,
                    linktype: 'image',
                    tab: 'innerlink',
                    'data-itemshowtype': '',
                    target: '_blank',
                    'data-linktype': '1',
                }
            });

            const jump = wxEl(doc, 'span', { cls: 'js_jump_icon h5_image_link' });

            const img = wxEl(doc, 'img', {
                cls: 'rich_pages wxw-img',
                attr: {
                    'data-src': wxSrc,
                    'data-ratio': '0.18611111111111112',
                    'data-s': '300,640',
                    'data-type': imgFormat,
                    'data-w': '1080',
                    type: 'block',
                    'data-imgfileid': '100005308',
                    src: wxSrc,
                }
            });

            jump.appendChild(img);
            a.appendChild(jump);
            aTag.replaceWith(a);
        });

        return doc.body.innerHTML;
    }

    format_wxmp_h1 = (title: string): string => {
        let css = `
        <h1 style="box-sizing: border-box; border-width: 0px 0px 2px; border-style: solid; border-bottom-color: rgb(0, 152, 116); font-size: 19.6px; font-weight: bold; margin: 2em auto 1em; text-align: center; line-height: 1.75; font-family: Menlo, Monaco, &quot;Courier New&quot;, monospace; display: table; padding: 0.5em 1em; color: rgb(63, 63, 63); text-shadow: rgba(0, 0, 0, 0.1) 2px 2px 4px; visibility: visible;"><span leaf="" style="visibility: visible;">${title}</span></h1>
        `.trim()
        return css;
    }

    format_wxmp_h2 = (title: string): string => {
        let css = `
        <h2 style="box-sizing: border-box;border-width: 0px;border-style: solid;border-color: hsl(var(--border));font-size: 18.2px;font-weight: bold;margin: 4em auto 2em;text-align: center;line-height: 1.75;font-family: Menlo, Monaco, &quot;Courier New&quot;, monospace;display: table;padding: 0.3em 1em;color: rgb(255, 255, 255);background: rgb(0, 152, 116);border-radius: 8px;box-shadow: rgba(0, 0, 0, 0.1) 0px 4px 6px;"><span leaf="">${title}</span></h2>
        `.trim()
        return css;
    }

    format_wxmp_h3 = (title: string): string => {
        let css = `
        <h3 style="box-sizing: border-box;border-width: 0px 0px 1px 4px;border-style: solid solid dashed;border-bottom-color: rgb(0, 152, 116);border-left-color: rgb(0, 152, 116);font-size: 16.8px;font-weight: bold;margin: 2em 8px 0.75em 0px;text-align: left;line-height: 1.2;font-family: Menlo, Monaco, &quot;Courier New&quot;, monospace;padding-left: 12px;color: rgb(63, 63, 63);"><span leaf="">${title}</span></h3>
        `.trim()
        return css;
    }

    format_wxmp_p_code = (code: string): string => {
        let css = `
        <code style="box-sizing: border-box; border-width: 0px; border-style: solid; border-color: hsl(var(--border)); font-family: -apple-system-font, BlinkMacSystemFont, &quot;Helvetica Neue&quot;, &quot;PingFang SC&quot;, &quot;Hiragino Sans GB&quot;, &quot;Microsoft YaHei UI&quot;, &quot;Microsoft YaHei&quot;, Arial, sans-serif; font-feature-settings: normal; font-variation-settings: normal; font-size: 12.6px; text-align: left; line-height: 1.75; color: rgb(221, 17, 68); background: rgba(27, 31, 35, 0.05); padding: 3px 5px; border-radius: 4px; visibility: visible;"><span leaf="" style="visibility: visible;">${code}</span></code>`.trim()
        return css;
    }

    format_wxmp_li_code = (code: string): string => {
        let css = `
        <code style="box-sizing: border-box; border-width: 0px; border-style: solid; border-color: hsl(var(--border)); font-family: -apple-system-font, BlinkMacSystemFont, &quot;Helvetica Neue&quot;, &quot;PingFang SC&quot;, &quot;Hiragino Sans GB&quot;, &quot;Microsoft YaHei UI&quot;, &quot;Microsoft YaHei&quot;, Arial, sans-serif; font-feature-settings: normal; font-variation-settings: normal; font-size: 12.6px; text-align: left; line-height: 1.75; color: rgb(221, 17, 68); background: rgba(27, 31, 35, 0.05); padding: 3px 5px; border-radius: 4px; visibility: visible;"><span leaf="" style="visibility: visible;">${code}</span></code>`.trim()
        return css;
    }

    is_code_balck(section: SectionCache, sec:string, lang:string){
        return section.type == 'code' && sec.trim().slice(3).startsWith(lang)
    }

    format_code_block_cards_album = async (section: SectionCache, sec:string) => {
        if(section.type != 'code' || !sec.trim().slice(3).startsWith('cards-album')){
            return null;
        }
        let items = [];
        for(let ctx of sec.split('images:')[1].split(/\n\s+/)){
            if(ctx.trim() == ''){
                continue;
            }
            let img = await this.images2html(ctx);
            if(img){
                items.push(img);;
            }
        }
        if(items.length == 0){
            return null;
        }
        return items;
    }

    format_section_html = async (section: SectionCache, sec:string) => {
        if(section.type=='html'){
            return sec;
        }else{
            return null;
        }
    }


    generateSideBySideImages(base64Images: string[]) {
        const sectionStart = `<section style="color: rgb(0, 0, 0);font-family: 'Microsoft YaHei';font-size: medium;font-style: normal;font-variant-ligatures: normal;font-variant-caps: normal;font-weight: 400;letter-spacing: normal;orphans: 2;text-align: start;text-indent: 0px;text-transform: none;widows: 2;word-spacing: 0px;-webkit-text-stroke-width: 0px;white-space: normal;text-decoration-thickness: initial;text-decoration-style: initial;text-decoration-color: initial;margin-bottom: 18px;display: flex;justify-content: space-between;flex-shrink: 0;">`;

        const sectionEnd = `</section>`;

        const imageSections = base64Images.map((base64, index) => {
            return `
            <section key="${index}" style="font-family: 'PingFang SC', system-ui, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', Arial, sans-serif;display: inline-block;flex: 1 1 0%;padding: 0px 4px;">
              <section>
                <section style="text-align: center;margin-bottom: 12px;" nodeleaf="">
                  <img alt="Image" class="rich_pages wxw-img" 
                    style="display: inline-block; max-width: 100%; height: auto !important; border-radius: 12px; visibility: visible !important; width: 330.5px !important;" 
                    src="${base64}" crossorigin="anonymous">
                </section>
              </section>
            </section>
          `;
        }).join("");

        return sectionStart + imageSections + sectionEnd;
    }

    async images2html(imgs: string | string[]): Promise<string | null> {
        if (Array.isArray(imgs)) {
            let ximgs = [];
            for (let x of imgs) {
                if (x.startsWith('http')) {
                    ximgs.push(x)
                } else {
                    let c = await this.image_to_img(x, true);
                    ximgs.push(c)
                }
            }
            ximgs = ximgs.filter((x): x is string => x !== undefined && x !== null);
            if (ximgs.length > 0) {
                let html = this.generateSideBySideImages(ximgs);
                return html
            } else {
                return null;
            }
        } else if (typeof imgs == 'string') {
            let obsidianImgs = imgs.match(/!?\[\[([^|\]]+\.(?:png|jpg|jpeg|gif|webp|bmp|svg))(?:\|.*?)?]]/g) || [];

            let markdownImgs = Array.from(
                imgs.matchAll(/!\[\]\((https?:\/\/[^\s)]+)\)/g),
                m => m[1]
            );

            // 合并两种图片链接
            let ximgs = [...obsidianImgs, ...markdownImgs];
            return this.images2html(ximgs);
        }else{
            return null;
        }
    }
}

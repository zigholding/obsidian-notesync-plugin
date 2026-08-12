import { App, TFile } from 'obsidian';
import { marked } from 'marked';
import NoteSyncPlugin from '../main';

/** Office / WPS 粘贴友好的 Word HTML 导出 */
export class Word {
	marked = marked;
	app: App;
	plugin: NoteSyncPlugin;

	constructor(plugin: NoteSyncPlugin) {
		this.plugin = plugin;
		this.app = plugin.app;
	}

	/**
	 * 使用 Word 内置样式名：正文 / 标题 N，避免粘贴成「普通（网站）」
	 * class 必须为 MsoNormal，并由 mso-style-name 映射到「正文」
	 */
	get styles() {
		return {
			h1: 'margin-top:17.0pt;margin-right:0cm;margin-bottom:16.5pt;margin-left:0cm;text-align:justify;text-justify:inter-ideograph;line-height:240%;mso-pagination:widow-orphan;page-break-after:avoid;mso-outline-level:1;font-size:22.0pt;font-family:黑体;mso-font-kerning:22.0pt;font-weight:bold;',
			h2: 'margin-top:13.0pt;margin-right:0cm;margin-bottom:13.0pt;margin-left:0cm;text-align:justify;text-justify:inter-ideograph;line-height:173%;mso-pagination:widow-orphan;page-break-after:avoid;mso-outline-level:2;font-size:16.0pt;font-family:黑体;font-weight:bold;',
			h3: 'margin-top:13.0pt;margin-right:0cm;margin-bottom:13.0pt;margin-left:0cm;text-align:justify;text-justify:inter-ideograph;line-height:173%;mso-pagination:widow-orphan;page-break-after:avoid;mso-outline-level:3;font-size:14.0pt;font-family:黑体;font-weight:bold;',
			h4: 'margin-top:12.0pt;margin-right:0cm;margin-bottom:6.0pt;margin-left:0cm;text-align:justify;text-justify:inter-ideograph;line-height:156%;mso-pagination:widow-orphan;page-break-after:avoid;mso-outline-level:4;font-size:12.0pt;font-family:黑体;font-weight:bold;',
			h5: 'margin-top:12.0pt;margin-right:0cm;margin-bottom:6.0pt;margin-left:0cm;text-align:justify;text-justify:inter-ideograph;mso-pagination:widow-orphan;page-break-after:avoid;mso-outline-level:5;font-size:12.0pt;font-family:黑体;font-weight:bold;',
			h6: 'margin-top:12.0pt;margin-right:0cm;margin-bottom:6.0pt;margin-left:0cm;text-align:justify;text-justify:inter-ideograph;mso-pagination:widow-orphan;page-break-after:avoid;mso-outline-level:6;font-size:10.5pt;font-family:黑体;font-weight:bold;',
			p: 'margin:0cm;margin-bottom:8.0pt;text-align:justify;text-justify:inter-ideograph;mso-pagination:widow-orphan;font-size:12.0pt;font-family:宋体;mso-ascii-font-family:宋体;mso-fareast-font-family:宋体;mso-hansi-font-family:宋体;mso-bidi-font-family:"Times New Roman";mso-font-kerning:1.0pt;',
			ul: 'margin-top:0cm;margin-bottom:6.0pt;margin-left:0cm;padding-left:16.0pt;',
			ol: 'margin-top:0cm;margin-bottom:6.0pt;margin-left:0cm;padding-left:18.0pt;',
			li: 'margin:0cm;margin-left:0cm;padding-left:0cm;text-indent:0cm;text-align:justify;text-justify:inter-ideograph;mso-pagination:widow-orphan;font-size:12.0pt;font-family:宋体;mso-ascii-font-family:宋体;mso-fareast-font-family:宋体;mso-hansi-font-family:宋体;',
			blockquote: 'margin:6.0pt 0cm 6.0pt 0cm;padding-left:8.0pt;border:none;border-left:solid #999999 2.0pt;mso-border-left-alt:solid #999999 2.0pt;font-size:12.0pt;font-family:宋体;color:#333333;',
			code: 'font-family:Consolas,"Courier New",monospace;font-size:10.5pt;mso-highlight:silver;',
			pre: 'margin:6.0pt 0cm;margin-left:0cm;padding:4.0pt 6.0pt;font-family:Consolas,"Courier New",monospace;font-size:10.5pt;mso-highlight:silver;white-space:pre-wrap;text-indent:0cm;',
			strong: 'font-weight:bold;',
			em: 'font-style:italic;',
			a: 'color:blue;text-decoration:underline;',
			table: 'border-collapse:collapse;margin:8.0pt 0cm;font-size:12.0pt;font-family:宋体;',
			th: 'border:solid windowtext 1.0pt;padding:4.0pt 8.0pt;font-weight:bold;',
			td: 'border:solid windowtext 1.0pt;padding:4.0pt 8.0pt;',
			img: 'max-width:100%;',
		};
	}

	async section_to_word(section: any, sec: string) {
		if (section.type == 'yaml') {
			return null;
		}
		if (section.type == 'html') {
			return await this.html_to_word(sec);
		}
		let html = this.marked.parse(sec) as string;
		return await this.html_to_word(html);
	}

	async selection_to_word() {
		let htmls: string[] = [];
		let sel = this.plugin.easyapi.ceditor.cm.state.selection.main;
		if (sel.from == sel.to) {
			return null;
		}
		let ctx = await this.plugin.easyapi.ccontent;
		if (!ctx) {
			return null;
		}
		for (let section of this.plugin.easyapi.cmeta?.sections || []) {
			if (sel.to <= section.position.start.offset) {
				continue;
			}
			if (sel.from >= section.position.end.offset) {
				continue;
			}
			let from = Math.max(sel.from, section.position.start.offset);
			let to = Math.min(sel.to, section.position.end.offset);
			let sec = ctx.slice(from, to).trim();

			if (section.type == 'code') {
				let items = this.plugin.easyapi.editor
					.slice_by_position(ctx, section.position)
					.trim()
					.split('\n');
				if (!sec.startsWith(items[0])) {
					sec = items[0] + '\n' + sec;
				}
				if (!sec.endsWith(items.last() || '')) {
					sec = sec + '\n' + items.last();
				}
			}

			if (sec == '') {
				continue;
			}
			let rhtml = await this.section_to_word(section, sec);
			if (!rhtml) {
				continue;
			}
			htmls.push(rhtml);
		}
		await this.copy_as_word(htmls);
	}

	async tfile_to_word(tfile: TFile) {
		let htmls: string[] = [];
		let ctx = await this.app.vault.read(tfile);
		for (let section of this.app.metadataCache.getFileCache(tfile)?.sections || []) {
			if (section.type == 'yaml') {
				continue;
			}
			let sec = this.plugin.easyapi.editor.slice_by_position(ctx, section.position);
			let rhtml = await this.section_to_word(section, sec);
			if (!rhtml) {
				continue;
			}
			htmls.push(rhtml);
		}
		await this.copy_as_word(htmls);
	}

	async html_to_word(html: string) {
		let rhtml = this.plugin.wxmp.convertVaultImageLinksToImgTag(html);
		rhtml = await this.plugin.wxmp.convertImageTagsToBase64(rhtml);
		rhtml = this.plugin.wxmp.html_replace_wikilink(rhtml);
		rhtml = this.apply_word_styles(rhtml);
		return rhtml;
	}

	apply_word_styles(htmlString: string) {
		let parser = new DOMParser();
		let doc = parser.parseFromString(htmlString, 'text/html');
		let styles = this.styles;

		let tagStyle: { [key: string]: string } = {
			h1: styles.h1,
			h2: styles.h2,
			h3: styles.h3,
			h4: styles.h4,
			h5: styles.h5,
			h6: styles.h6,
			p: styles.p,
			ul: styles.ul,
			ol: styles.ol,
			li: styles.li,
			blockquote: styles.blockquote,
			pre: styles.pre,
			strong: styles.strong,
			b: styles.strong,
			em: styles.em,
			i: styles.em,
			a: styles.a,
			table: styles.table,
			th: styles.th,
			td: styles.td,
			img: styles.img,
		};

		for (let tag in tagStyle) {
			doc.querySelectorAll(tag).forEach((el) => {
				this.merge_style(el as HTMLElement, tagStyle[tag]);
			});
		}

		// 嵌套列表再收一点，避免层层叠加过宽
		doc.querySelectorAll('ul ul, ol ol, ul ol, ol ul').forEach((el) => {
			this.merge_style(el as HTMLElement, 'margin-left:0cm;padding-left:14.0pt;');
		});

		// 行内 code（排除 pre > code，避免覆盖代码块样式）
		doc.querySelectorAll('code').forEach((el) => {
			if (el.closest('pre')) {
				return;
			}
			this.merge_style(el as HTMLElement, styles.code);
		});

		// marked 松散列表里的 <p> 在 Word 中易多出空行
		doc.querySelectorAll('li > p').forEach((p) => {
			let li = p.parentElement;
			if (!li) return;
			while (p.firstChild) {
				li.insertBefore(p.firstChild, p);
			}
			p.remove();
		});

		// checkbox 任务列表 → 字符，Word 不识别 input
		doc.querySelectorAll('li input[type="checkbox"]').forEach((el) => {
			let checked =
				(el as HTMLInputElement).checked || el.hasAttribute('checked');
			let mark = doc.createTextNode((checked ? '☑' : '☐') + ' ');
			el.replaceWith(mark);
		});

		// 映射到 Word 内置「正文」，避免变成「普通（网站）」
		doc.querySelectorAll('p, div, li').forEach((el) => {
			(el as HTMLElement).className = 'MsoNormal';
		});

		return doc.body.innerHTML;
	}

	merge_style(el: HTMLElement, css: string) {
		let prev = el.getAttribute('style') || '';
		el.setAttribute('style', (prev ? prev.replace(/;?\s*$/, ';') : '') + css);
	}

	/** Word/WPS 识别的 HTML 信封：显式声明「正文」「标题 N」内置样式 */
	wrap_word_document(bodyHtml: string) {
		let s = this.styles;
		return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="ProgId" content="Word.Document">
<meta name="Generator" content="Microsoft Word">
<!--[if gte mso 9]>
<xml>
<w:WordDocument>
<w:View>Print</w:View>
<w:Zoom>100</w:Zoom>
<w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml>
<![endif]-->
<style>
<!--
 /* Style Definitions */
 p.MsoNormal, li.MsoNormal, div.MsoNormal
	{mso-style-name:正文;
	mso-style-unhide:no;
	mso-style-qformat:yes;
	mso-style-parent:"";
	${s.p}}
h1
	{mso-style-name:"标题 1";
	mso-style-priority:9;
	mso-style-qformat:yes;
	mso-style-next:正文;
	${s.h1}}
h2
	{mso-style-name:"标题 2";
	mso-style-priority:9;
	mso-style-qformat:yes;
	mso-style-next:正文;
	${s.h2}}
h3
	{mso-style-name:"标题 3";
	mso-style-priority:9;
	mso-style-qformat:yes;
	mso-style-next:正文;
	${s.h3}}
h4
	{mso-style-name:"标题 4";
	mso-style-priority:9;
	mso-style-qformat:yes;
	mso-style-next:正文;
	${s.h4}}
h5
	{mso-style-name:"标题 5";
	mso-style-priority:9;
	mso-style-qformat:yes;
	mso-style-next:正文;
	${s.h5}}
h6
	{mso-style-name:"标题 6";
	mso-style-priority:9;
	mso-style-qformat:yes;
	mso-style-next:正文;
	${s.h6}}
li.MsoNormal
	{${s.li}}
ul
	{${s.ul}}
ol
	{${s.ol}}
blockquote
	{${s.blockquote}}
code
	{${s.code}}
pre
	{${s.pre}}
strong,b
	{${s.strong}}
em,i
	{${s.em}}
a
	{${s.a}}
table
	{${s.table}}
th
	{${s.th}}
td
	{${s.td}}
img
	{${s.img}}
-->
</style>
</head>
<body lang=ZH-CN style='tab-interval:16.0pt;word-wrap:break-word'>
<!--StartFragment-->
${bodyHtml}
<!--EndFragment-->
</body>
</html>`;
	}

	strip_html(html: string) {
		let parser = new DOMParser();
		let doc = parser.parseFromString(html, 'text/html');
		return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
	}

	async copy_as_word(ctx: string | string[]) {
		if (typeof ctx == 'string') {
			ctx = [ctx];
		}
		let body = ctx.filter((x) => x && x.trim()).join('\n');
		let html = this.wrap_word_document(body);
		let plain = this.strip_html(body);

		let data = new ClipboardItem({
			'text/html': new Blob([html], { type: 'text/html' }),
			'text/plain': new Blob([plain], { type: 'text/plain' }),
		});
		await navigator.clipboard.write([data]);
	}
}

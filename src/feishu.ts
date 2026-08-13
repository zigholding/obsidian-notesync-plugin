import { Notice, TFile, TFolder, TAbstractFile, requestUrl } from 'obsidian';
import NoteSyncPlugin from '../main';

const FEISHU_API = 'https://open.feishu.cn/open-apis';
const IMG_EXT = /^(png|jpg|jpeg|gif|webp|svg|bmp)$/i;
const MAX_BLOCKS = 1000;

interface WikiSpace {
	space_id: string;
	name: string;
}

interface WikiNode {
	space_id: string;
	node_token: string;
	obj_token: string;
	obj_type: string;
	title: string;
	has_child?: boolean;
	parent_node_token?: string;
}

interface LocalImage {
	alt: string;
	file?: TFile;
	url?: string;
}

interface FeishuBinding {
	SpaceId: string;
	NodeToken: string;
	ObjToken: string;
}

/** 通过飞书开放平台 API 将笔记上传到知识库（非剪贴板） */
export class Feishu {
	plugin: NoteSyncPlugin;
	private token = '';
	private tokenExpireAt = 0;

	constructor(plugin: NoteSyncPlugin) {
		this.plugin = plugin;
	}

	async testConnection() {
		try {
			await this.getToken(true);
			let spaces: WikiSpace[] = [];
			try {
				spaces = await this.listSpaces();
			} catch {
				spaces = [];
			}
			const parent = this.resolveParentFromSettings();
			if (parent) {
				try {
					const node = await this.getNode(parent);
					if (node.space_id && this.plugin.settings.feishu_space_id !== node.space_id) {
						this.plugin.settings.feishu_space_id = node.space_id;
						await this.plugin.saveSettings();
					}
					new Notice(
						this.plugin.strings.notice_feishu_connected_node.replace(
							'{name}',
							node.title || node.node_token
						),
						6000
					);
					return;
				} catch {
					/* fall through */
				}
			}
			if (spaces.length) {
				new Notice(
					this.plugin.strings.notice_feishu_connected.replace(
						'{n}',
						String(spaces.length)
					),
					5000
				);
				return;
			}
			new Notice(this.plugin.strings.notice_feishu_no_space, 8000);
		} catch (e) {
			this.fail(e);
		}
	}

	async pickDestination() {
		try {
			let spaces: WikiSpace[] = [];
			try {
				spaces = await this.listSpaces();
			} catch {
				spaces = [];
			}
			if (!spaces.length) {
				const pasted = await this.plugin.easyapi.dialog_prompt(
					this.plugin.strings.prompt_feishu_wiki_url
				);
				if (!pasted) {
					return;
				}
				await this.saveDestinationFromInput(pasted);
				return;
			}
			const space = await this.plugin.easyapi.dialog_suggest(
				spaces.map((s) => s.name),
				spaces,
				this.plugin.strings.prompt_feishu_space
			);
			if (!space) {
				return;
			}

			let parentToken = '';
			let label = space.name;
			while (true) {
				const nodes = await this.listNodes(space.space_id, parentToken);
				const labels = [
					this.plugin.strings.item_feishu_use_here,
					...nodes.map(
						(n) => (n.has_child ? '📁 ' : '📄 ') + (n.title || n.node_token)
					),
				];
				const values: Array<{ use: boolean; node?: WikiNode }> = [
					{ use: true },
					...nodes.map((n) => ({ use: false, node: n })),
				];
				const pick = await this.plugin.easyapi.dialog_suggest(
					labels,
					values,
					label
				);
				if (!pick) {
					return;
				}
				if (pick.use || !pick.node) {
					break;
				}
				parentToken = pick.node.node_token;
				label = pick.node.title || pick.node.node_token;
			}

			this.plugin.settings.feishu_space_id = space.space_id;
			this.plugin.settings.feishu_parent_node = parentToken;
			await this.plugin.saveSettings();
			new Notice(
				this.plugin.strings.notice_feishu_dest_ok.replace('{name}', label),
				5000
			);
		} catch (e) {
			this.fail(e);
		}
	}

	async uploadCurrentNote() {
		const tfile = this.plugin.app.workspace.getActiveFile();
		if (!tfile) {
			return;
		}
		await this.uploadFileOrFolder(tfile);
	}

	async uploadFileOrFolder(file: TAbstractFile) {
		try {
			if (file instanceof TFolder) {
				const dest = await this.ensureDestination();
				new Notice(this.plugin.strings.notice_feishu_uploading, 3000);
				const n = await this.uploadFolder(file, dest.spaceId, dest.parentNode);
				new Notice(
					this.plugin.strings.notice_feishu_folder_ok.replace('{n}', String(n)),
					6000
				);
				return;
			}
			if (!(file instanceof TFile) || file.extension !== 'md') {
				new Notice(this.plugin.strings.notice_feishu_md_only, 4000);
				return;
			}
			new Notice(this.plugin.strings.notice_feishu_uploading, 3000);
			const url = await this.uploadNote(file);
			if (url) {
				try {
					await navigator.clipboard.writeText(url);
				} catch {
					/* ignore */
				}
				new Notice(
					this.plugin.strings.notice_feishu_note_ok.replace('{url}', url),
					8000
				);
			} else {
				new Notice(this.plugin.strings.notice_feishu_note_ok_nolink, 5000);
			}
		} catch (e) {
			this.fail(e);
		}
	}

	private async uploadFolder(
		folder: TFolder,
		spaceId: string,
		parentNode: string
	): Promise<number> {
		const folderNode = await this.findOrCreateNode(
			spaceId,
			folder.name,
			parentNode
		);
		let count = 0;
		for (const child of folder.children) {
			if (child instanceof TFolder) {
				if (child.name.startsWith('.')) {
					continue;
				}
				count += await this.uploadFolder(
					child,
					spaceId,
					folderNode.node_token
				);
			} else if (child instanceof TFile && child.extension === 'md') {
				await this.uploadNote(child, {
					spaceId,
					parentNode: folderNode.node_token,
				});
				count += 1;
			}
		}
		return count;
	}

	private async uploadNote(
		tfile: TFile,
		dest?: { spaceId: string; parentNode: string }
	): Promise<string> {
		const target = dest || (await this.ensureDestination());
		const binding = this.readBinding(tfile);
		let node: WikiNode | null = null;

		if (binding?.ObjToken && binding.NodeToken) {
			try {
				node = await this.getNode(binding.NodeToken);
			} catch {
				node = null;
			}
		}

		if (!node) {
			node = await this.findOrCreateNode(
				target.spaceId,
				tfile.basename,
				target.parentNode
			);
		} else if (node.title !== tfile.basename) {
			await this.api(
				'POST',
				`/wiki/v2/spaces/${node.space_id}/nodes/${node.node_token}/update_title`,
				{ title: tfile.basename }
			);
		}

		const raw = await this.plugin.app.vault.read(tfile);
		const prepared = this.prepareMarkdown(tfile, raw);
		await this.replaceDocument(node.obj_token, prepared.markdown);
		if (prepared.images.length) {
			await this.fillImages(node.obj_token, prepared.images);
		}

		await this.writeBinding(tfile, {
			SpaceId: node.space_id,
			NodeToken: node.node_token,
			ObjToken: node.obj_token,
		});

		const domain = this.plugin.settings.feishu_domain.replace(/\/$/, '');
		return domain ? `${domain}/wiki/${node.node_token}` : '';
	}

	private resolveParentFromSettings(): string {
		const raw = this.plugin.settings.feishu_parent_node.trim();
		const parsed = this.parseWikiInput(raw);
		return parsed.nodeToken || (raw.startsWith('http') ? '' : raw);
	}

	private async saveDestinationFromInput(input: string) {
		const parsed = this.parseWikiInput(input);
		if (parsed.domain) {
			this.plugin.settings.feishu_domain = parsed.domain;
		}
		const token = parsed.nodeToken || input.trim();
		if (!token) {
			throw new Error(this.plugin.strings.notice_feishu_no_dest);
		}
		const node = await this.getNode(token);
		this.plugin.settings.feishu_space_id = node.space_id;
		this.plugin.settings.feishu_parent_node = node.node_token;
		await this.plugin.saveSettings();
		new Notice(
			this.plugin.strings.notice_feishu_dest_ok.replace(
				'{name}',
				node.title || node.node_token
			),
			5000
		);
	}

	private async ensureDestination(): Promise<{
		spaceId: string;
		parentNode: string;
	}> {
		let spaceId = this.plugin.settings.feishu_space_id.trim();
		let parentNode = this.plugin.settings.feishu_parent_node.trim();
		const parsed = this.parseWikiInput(parentNode);
		if (parsed.domain) {
			this.plugin.settings.feishu_domain = parsed.domain;
		}
		if (parsed.spaceId && !spaceId) {
			spaceId = parsed.spaceId;
		}
		if (parsed.nodeToken) {
			parentNode = parsed.nodeToken;
		}
		if (!spaceId && parentNode) {
			const node = await this.getNode(parentNode);
			spaceId = node.space_id;
			this.plugin.settings.feishu_space_id = spaceId;
			this.plugin.settings.feishu_parent_node = parentNode;
			await this.plugin.saveSettings();
		}
		if (!spaceId) {
			await this.pickDestination();
			spaceId = this.plugin.settings.feishu_space_id.trim();
			parentNode = this.plugin.settings.feishu_parent_node.trim();
		}
		if (!spaceId) {
			throw new Error(this.plugin.strings.notice_feishu_no_dest);
		}
		return { spaceId, parentNode };
	}

	private async findOrCreateNode(
		spaceId: string,
		title: string,
		parentNode: string
	): Promise<WikiNode> {
		const siblings = await this.listNodes(spaceId, parentNode);
		const existed = siblings.find((n) => n.title === title && n.obj_type === 'docx');
		if (existed) {
			return existed;
		}
		const body: Record<string, string> = {
			obj_type: 'docx',
			node_type: 'origin',
			title,
		};
		if (parentNode) {
			body.parent_node_token = parentNode;
		}
		const data = await this.api(
			'POST',
			`/wiki/v2/spaces/${spaceId}/nodes`,
			body
		);
		return data.node as WikiNode;
	}

	private async replaceDocument(documentId: string, markdown: string) {
		await this.clearChildren(documentId);
		const converted = await this.api('POST', '/docx/v1/documents/blocks/convert', {
			content_type: 'markdown',
			content: markdown || ' ',
		});
		const blocks: any[] = converted.blocks || [];
		const firstIds: string[] = (converted.first_level_block_ids || []).filter(
			(id: string) => {
				const b = blocks.find((x) => x.block_id === id);
				return b && b.block_type !== 1;
			}
		);
		if (!firstIds.length || !blocks.length) {
			return;
		}
		await this.insertBatches(documentId, firstIds, blocks);
	}

	private async insertBatches(
		documentId: string,
		firstIds: string[],
		blocks: any[]
	) {
		const byId = new Map(blocks.map((b) => [b.block_id, b]));
		const collect = (id: string): any[] => {
			const b = byId.get(id);
			if (!b) {
				return [];
			}
			const nested = (b.children || []).flatMap((cid: string) => collect(cid));
			return [b, ...nested];
		};

		let curIds: string[] = [];
		let curDesc: any[] = [];
		const seen = new Set<string>();
		const flush = async () => {
			if (!curIds.length) {
				return;
			}
			await this.api(
				'POST',
				`/docx/v1/documents/${documentId}/blocks/${documentId}/descendant`,
				{
					children_id: curIds,
					descendants: this.sanitize(curDesc),
					index: -1,
				}
			);
			curIds = [];
			curDesc = [];
			seen.clear();
		};

		for (const id of firstIds) {
			const tree = collect(id);
			if (tree.length > MAX_BLOCKS) {
				throw new Error(this.plugin.strings.notice_feishu_too_large);
			}
			if (curDesc.length + tree.length > MAX_BLOCKS) {
				await flush();
			}
			curIds.push(id);
			for (const b of tree) {
				if (!seen.has(b.block_id)) {
					seen.add(b.block_id);
					curDesc.push(b);
				}
			}
		}
		await flush();
	}

	private sanitize(blocks: any[]) {
		return blocks.map((b) => {
			const x = JSON.parse(JSON.stringify(b));
			delete x.parent_id;
			if (!Array.isArray(x.children)) {
				x.children = [];
			}
			if (x.block_type === 31 && x.table?.property?.merge_info) {
				delete x.table.property.merge_info;
			}
			return x;
		});
	}

	private async clearChildren(documentId: string) {
		while (true) {
			const data = await this.api(
				'GET',
				`/docx/v1/documents/${documentId}/blocks/${documentId}/children?page_size=500`
			);
			const items = data.items || [];
			if (!items.length) {
				return;
			}
			await this.api(
				'DELETE',
				`/docx/v1/documents/${documentId}/blocks/${documentId}/children/batch_delete`,
				{ start_index: 0, end_index: items.length }
			);
			if (!data.has_more) {
				return;
			}
		}
	}

	private async fillImages(documentId: string, images: LocalImage[]) {
		const listed: any[] = [];
		let pageToken = '';
		do {
			const qs = new URLSearchParams({ page_size: '500' });
			if (pageToken) {
				qs.set('page_token', pageToken);
			}
			const data = await this.api(
				'GET',
				`/docx/v1/documents/${documentId}/blocks?${qs.toString()}`
			);
			listed.push(...(data.items || []));
			pageToken = data.has_more ? data.page_token : '';
		} while (pageToken);

		const imageBlocks = listed.filter((b) => b.block_type === 27);
		const n = Math.min(imageBlocks.length, images.length);
		for (let i = 0; i < n; i++) {
			try {
				await this.uploadImageToBlock(documentId, imageBlocks[i].block_id, images[i]);
			} catch (e) {
				console.error('Feishu image upload failed', e);
			}
		}
	}

	private async uploadImageToBlock(
		documentId: string,
		blockId: string,
		image: LocalImage
	) {
		const bin = await this.readImage(image);
		if (!bin) {
			return;
		}
		const token = await this.getToken();
		const boundary = '----NoteSyncFeishu' + Date.now();
		const extra = JSON.stringify({ drive_route_token: documentId });
		const fields: Record<string, string> = {
			file_name: bin.name,
			parent_type: 'docx_image',
			parent_node: blockId,
			size: String(bin.data.byteLength),
			extra,
		};
		const body = this.buildMultipart(boundary, fields, bin.name, bin.mime, bin.data);
		const res = await requestUrl({
			url: `${FEISHU_API}/drive/v1/medias/upload_all`,
			method: 'POST',
			headers: { Authorization: `Bearer ${token}` },
			contentType: `multipart/form-data; boundary=${boundary}`,
			body,
			throw: false,
		});
		const json = this.parseJson(res);
		if (res.status >= 400 || json?.code) {
			throw new Error(json?.msg || `upload image HTTP ${res.status}`);
		}
		const fileToken = json?.data?.file_token;
		if (!fileToken) {
			return;
		}
		await this.api('PATCH', `/docx/v1/documents/${documentId}/blocks/${blockId}`, {
			replace_image: { token: fileToken },
		});
	}

	private async readImage(
		image: LocalImage
	): Promise<{ name: string; mime: string; data: ArrayBuffer } | null> {
		if (image.file) {
			const data = await this.plugin.app.vault.readBinary(image.file);
			return {
				name: image.file.name,
				mime: this.mimeOf(image.file.extension),
				data,
			};
		}
		if (image.url) {
			const res = await requestUrl({ url: image.url, throw: false });
			if (res.status >= 400) {
				return null;
			}
			const mime =
				(res.headers['content-type'] || 'image/png').split(';')[0];
			const ext = mime.split('/')[1] || 'png';
			return { name: `image.${ext}`, mime, data: res.arrayBuffer };
		}
		return null;
	}

	private prepareMarkdown(
		tfile: TFile,
		raw: string
	): { markdown: string; images: LocalImage[] } {
		const cache = this.plugin.app.metadataCache.getFileCache(tfile);
		let ctx = raw;
		if (cache?.frontmatterPosition?.end?.offset) {
			ctx = ctx.slice(cache.frontmatterPosition.end.offset).replace(/^\s+/, '');
		}

		const images: LocalImage[] = [];
		const placeholder = (img: LocalImage) => {
			const i = images.length;
			images.push(img);
			return `![${img.alt}](https://obsidian.local/feishu-img/${i})`;
		};

		ctx = ctx.replace(
			/!\[\[([^\]|#\n]+)(?:\|[^\]]*)?\]\]/g,
			(match, link: string) => {
				const path = String(link).trim();
				const ext = path.split('.').pop() || '';
				if (!IMG_EXT.test(ext)) {
					return match;
				}
				const dest = this.plugin.app.metadataCache.getFirstLinkpathDest(
					path,
					tfile.path
				);
				if (!dest) {
					return match;
				}
				return placeholder({ alt: dest.basename, file: dest });
			}
		);

		ctx = ctx.replace(
			/!\[([^\]]*)\]\(([^)]+)\)/g,
			(match, alt: string, src: string) => {
				if (String(src).startsWith('https://obsidian.local/feishu-img/')) {
					return match;
				}
				let path = String(src).trim();
				const angle = path.match(/^<([^>]+)>/);
				if (angle) {
					path = angle[1];
				}
				path = path.split(/\s+/)[0];
				if (/^https?:\/\//i.test(path)) {
					return placeholder({ alt: alt || 'image', url: path });
				}
				try {
					path = decodeURIComponent(path);
				} catch {
					/* keep */
				}
				const dest = this.plugin.app.metadataCache.getFirstLinkpathDest(
					path,
					tfile.path
				);
				if (!dest) {
					return match;
				}
				return placeholder({ alt: alt || dest.basename, file: dest });
			}
		);

		ctx = ctx.replace(
			/\[\[([^\]|#\n]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g,
			(_m, name: string, alias?: string) => alias || name
		);

		return { markdown: ctx.trim() || tfile.basename, images };
	}

	private readBinding(tfile: TFile): FeishuBinding | null {
		const fm = this.plugin.app.metadataCache.getFileCache(tfile)?.frontmatter;
		const item = fm?.[this.plugin.yaml]?.Feishu;
		if (item?.NodeToken && item?.ObjToken) {
			return item as FeishuBinding;
		}
		return null;
	}

	private async writeBinding(tfile: TFile, binding: FeishuBinding) {
		await this.plugin.app.fileManager.processFrontMatter(tfile, (fm) => {
			const cur = fm[this.plugin.yaml] || {};
			cur.Feishu = binding;
			fm[this.plugin.yaml] = cur;
		});
	}

	parseWikiInput(input: string): {
		domain?: string;
		nodeToken?: string;
		spaceId?: string;
	} {
		const s = (input || '').trim();
		if (!s) {
			return {};
		}
		const settingsMatch = s.match(
			/^https?:\/\/([^/]+)\/wiki\/settings\/(\d+)/i
		);
		if (settingsMatch) {
			return {
				domain: 'https://' + settingsMatch[1],
				spaceId: settingsMatch[2],
			};
		}
		const wikiMatch = s.match(/^https?:\/\/([^/]+)\/wiki\/([A-Za-z0-9]+)/i);
		if (wikiMatch) {
			return {
				domain: 'https://' + wikiMatch[1],
				nodeToken: wikiMatch[2],
			};
		}
		if (/^\d+$/.test(s)) {
			return { spaceId: s };
		}
		return { nodeToken: s };
	}

	private async listSpaces(): Promise<WikiSpace[]> {
		const items: WikiSpace[] = [];
		let pageToken = '';
		do {
			const qs = new URLSearchParams({ page_size: '50' });
			if (pageToken) {
				qs.set('page_token', pageToken);
			}
			const data = await this.api('GET', `/wiki/v2/spaces?${qs.toString()}`);
			items.push(...(data.items || []));
			pageToken = data.has_more ? data.page_token : '';
		} while (pageToken);
		return items;
	}

	private async listNodes(
		spaceId: string,
		parentNode: string
	): Promise<WikiNode[]> {
		const items: WikiNode[] = [];
		let pageToken = '';
		do {
			const qs = new URLSearchParams({ page_size: '50' });
			if (pageToken) {
				qs.set('page_token', pageToken);
			}
			if (parentNode) {
				qs.set('parent_node_token', parentNode);
			}
			const data = await this.api(
				'GET',
				`/wiki/v2/spaces/${spaceId}/nodes?${qs.toString()}`
			);
			items.push(...(data.items || []));
			pageToken = data.has_more ? data.page_token : '';
		} while (pageToken);
		return items;
	}

	private async getNode(token: string): Promise<WikiNode> {
		const data = await this.api(
			'GET',
			`/wiki/v2/spaces/get_node?token=${encodeURIComponent(token)}`
		);
		return data.node as WikiNode;
	}

	private async getToken(force = false): Promise<string> {
		if (!force && this.token && Date.now() < this.tokenExpireAt) {
			return this.token;
		}
		const appId = this.plugin.settings.feishu_app_id.trim();
		const appSecret = this.plugin.settings.feishu_app_secret.trim();
		if (!appId || !appSecret) {
			throw new Error(this.plugin.strings.notice_feishu_no_app);
		}
		const res = await requestUrl({
			url: `${FEISHU_API}/auth/v3/tenant_access_token/internal`,
			method: 'POST',
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
			body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
			throw: false,
		});
		const json = this.parseJson(res);
		if (res.status >= 400 || json?.code) {
			throw new Error(json?.msg || `token HTTP ${res.status}`);
		}
		this.token = json.tenant_access_token;
		this.tokenExpireAt = Date.now() + Math.max(0, (json.expire || 7200) - 300) * 1000;
		return this.token;
	}

	private async api(method: string, path: string, body?: unknown) {
		const token = await this.getToken();
		const res = await requestUrl({
			url: FEISHU_API + path,
			method,
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json; charset=utf-8',
			},
			body: body === undefined ? undefined : JSON.stringify(body),
			throw: false,
		});
		const json = this.parseJson(res);
		if (res.status >= 400 || (json && json.code)) {
			throw new Error(json?.msg || `HTTP ${res.status}`);
		}
		return json?.data ?? json;
	}

	private parseJson(res: { json?: any; text?: string }) {
		if (res.json) {
			return res.json;
		}
		try {
			return JSON.parse(res.text || '{}');
		} catch {
			return {};
		}
	}

	private buildMultipart(
		boundary: string,
		fields: Record<string, string>,
		filename: string,
		mime: string,
		file: ArrayBuffer
	): ArrayBuffer {
		const enc = new TextEncoder();
		const parts: Uint8Array[] = [];
		for (const [key, value] of Object.entries(fields)) {
			parts.push(
				enc.encode(
					`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
				)
			);
		}
		parts.push(
			enc.encode(
				`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`
			)
		);
		parts.push(new Uint8Array(file));
		parts.push(enc.encode(`\r\n--${boundary}--\r\n`));
		const total = parts.reduce((n, p) => n + p.length, 0);
		const out = new Uint8Array(total);
		let offset = 0;
		for (const p of parts) {
			out.set(p, offset);
			offset += p.length;
		}
		return out.buffer;
	}

	private mimeOf(ext: string) {
		const map: Record<string, string> = {
			png: 'image/png',
			jpg: 'image/jpeg',
			jpeg: 'image/jpeg',
			gif: 'image/gif',
			webp: 'image/webp',
			svg: 'image/svg+xml',
			bmp: 'image/bmp',
		};
		return map[ext.toLowerCase()] || 'application/octet-stream';
	}

	private fail(e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		console.error('Feishu upload failed', e);
		new Notice(`${this.plugin.strings.notice_feishu_fail}: ${msg}`, 8000);
	}
}

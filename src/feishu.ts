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
	Dest?: string;
	SpaceId: string;
	NodeToken: string;
	ObjToken: string;
}

interface FeishuAccount {
	name: string;
	appId: string;
	appSecret: string;
	domain: string;
}

interface FeishuDest {
	name: string;
	account: FeishuAccount;
	parentRaw: string;
	spaceId: string;
}

interface ResolvedDest {
	name: string;
	account: FeishuAccount;
	spaceId: string;
	parentNode: string;
}

/** 通过飞书开放平台 API 将笔记上传到知识库（非剪贴板） */
export class Feishu {
	plugin: NoteSyncPlugin;
	private tokens = new Map<string, { token: string; expireAt: number }>();
	private currentAccount: FeishuAccount | null = null;

	constructor(plugin: NoteSyncPlugin) {
		this.plugin = plugin;
	}

	private useAccount(account: FeishuAccount) {
		this.currentAccount = account;
	}

	async testConnection() {
		try {
			const dests = this.listDests();
			const accounts = this.listAccounts();
			if (!accounts.length) {
				throw new Error(this.plugin.strings.notice_feishu_no_app);
			}

			let dest: FeishuDest | undefined;
			let account: FeishuAccount | undefined;
			if (dests.length === 1) {
				dest = dests[0];
				account = dest.account;
			} else if (dests.length > 1) {
				dest = await this.plugin.easyapi.dialog_suggest(
					dests.map((d) => d.name),
					dests,
					this.plugin.strings.prompt_feishu_dest
				);
				if (!dest) {
					return;
				}
				account = dest.account;
			} else if (accounts.length === 1) {
				account = accounts[0];
			} else {
				account = await this.plugin.easyapi.dialog_suggest(
					accounts.map((a) => a.name),
					accounts,
					this.plugin.strings.prompt_feishu_account
				);
				if (!account) {
					return;
				}
			}

			this.useAccount(account);
			await this.getToken(true);

			if (dest) {
				try {
					const resolved = await this.resolveDest(dest);
					const node = await this.getNode(resolved.parentNode);
					new Notice(
						this.plugin.strings.notice_feishu_connected_node.replace(
							'{name}',
							`${dest.name} / ${node.title || node.node_token}`
						),
						6000
					);
					return;
				} catch {
					/* fall through */
				}
			}

			let spaces: WikiSpace[] = [];
			try {
				spaces = await this.listSpaces();
			} catch {
				spaces = [];
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
			const accounts = this.listAccounts();
			if (!accounts.length) {
				throw new Error(this.plugin.strings.notice_feishu_no_app);
			}

			const dests = this.listDests();
			type DestPick = { isNew: boolean; dest: FeishuDest | null };
			const newItem: DestPick = { isNew: true, dest: null };
			let chosen: DestPick | null = null;
			if (!dests.length) {
				chosen = newItem;
			} else {
				const labels = [
					...dests.map((d) => d.name),
					this.plugin.strings.item_feishu_new_dest,
				];
				const values: DestPick[] = [
					...dests.map((d) => ({ isNew: false, dest: d })),
					newItem,
				];
				chosen = await this.plugin.easyapi.dialog_suggest(
					labels,
					values,
					this.plugin.strings.prompt_feishu_dest
				);
			}
			if (!chosen) {
				return;
			}

			let destName = chosen.dest?.name || '';
			let account = chosen.dest?.account;
			if (chosen.isNew || !account) {
				if (accounts.length === 1) {
					account = accounts[0];
				} else {
					account = await this.plugin.easyapi.dialog_suggest(
						accounts.map((a) => a.name),
						accounts,
						this.plugin.strings.prompt_feishu_account
					);
				}
				if (!account) {
					return;
				}
				const typed = await this.plugin.easyapi.dialog_prompt(
					this.plugin.strings.prompt_feishu_dest_name
				);
				destName = String(typed || '').trim();
				if (!destName) {
					return;
				}
			}

			if (!account || !destName) {
				return;
			}

			this.useAccount(account);
			const picked = await this.browseOrPasteParent();
			if (!picked) {
				return;
			}
			await this.persistDestMeta(destName, {
				spaceId: picked.spaceId,
				parentNode: picked.parentNode,
				domain: picked.domain || account.domain,
				account,
			});
			new Notice(
				this.plugin.strings.notice_feishu_dest_ok.replace(
					'{name}',
					`${destName} / ${picked.label}`
				),
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
				const n = await this.uploadFolder(file, dest);
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
		dest: ResolvedDest
	): Promise<number> {
		this.useAccount(dest.account);
		const folderNode = await this.findOrCreateNode(
			dest.spaceId,
			folder.name,
			dest.parentNode
		);
		const childDest: ResolvedDest = {
			...dest,
			parentNode: folderNode.node_token,
			spaceId: dest.spaceId,
		};
		let count = 0;
		for (const child of folder.children) {
			if (child instanceof TFolder) {
				if (child.name.startsWith('.')) {
					continue;
				}
				count += await this.uploadFolder(child, childDest);
			} else if (child instanceof TFile && child.extension === 'md') {
				await this.uploadNote(child, childDest);
				count += 1;
			}
		}
		return count;
	}

	private async uploadNote(
		tfile: TFile,
		folderDest?: ResolvedDest
	): Promise<string> {
		const binding = this.readBinding(tfile);
		const hint = this.readDestHint(tfile);
		let session: ResolvedDest;
		if (binding?.Dest) {
			session = await this.chooseDest(binding.Dest);
		} else if (hint) {
			session = await this.chooseDest(hint);
		} else if (binding?.NodeToken) {
			session = await this.sessionForLegacyBinding(binding, folderDest);
		} else if (folderDest) {
			session = folderDest;
		} else {
			session = await this.ensureDestination();
		}

		this.useAccount(session.account);
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
				session.spaceId,
				tfile.basename,
				session.parentNode
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
			Dest: session.name,
			SpaceId: node.space_id,
			NodeToken: node.node_token,
			ObjToken: node.obj_token,
		});

		const domain = session.account.domain.replace(/\/$/, '');
		return domain ? `${domain}/wiki/${node.node_token}` : '';
	}

	private async browseOrPasteParent(): Promise<{
		spaceId: string;
		parentNode: string;
		domain?: string;
		label: string;
	} | null> {
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
				return null;
			}
			const parsed = this.parseWikiInput(pasted);
			const token = parsed.nodeToken || pasted.trim();
			if (!token) {
				throw new Error(this.plugin.strings.notice_feishu_no_dest);
			}
			const node = await this.getNode(token);
			return {
				spaceId: node.space_id,
				parentNode: node.node_token,
				domain: parsed.domain,
				label: node.title || node.node_token,
			};
		}

		const space = await this.plugin.easyapi.dialog_suggest(
			spaces.map((s) => s.name),
			spaces,
			this.plugin.strings.prompt_feishu_space
		);
		if (!space) {
			return null;
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
				return null;
			}
			if (pick.use || !pick.node) {
				break;
			}
			parentToken = pick.node.node_token;
			label = pick.node.title || pick.node.node_token;
		}
		return {
			spaceId: space.space_id,
			parentNode: parentToken,
			label,
		};
	}

	private async ensureDestination(): Promise<ResolvedDest> {
		return this.chooseDest();
	}

	private async chooseDest(preferredName?: string): Promise<ResolvedDest> {
		const dests = this.listDests();
		if (preferredName) {
			const hit = dests.find((d) => d.name === preferredName);
			if (!hit) {
				throw new Error(
					this.plugin.strings.notice_feishu_dest_missing.replace(
						'{name}',
						preferredName
					)
				);
			}
			return this.resolveDest(hit);
		}
		if (dests.length === 1) {
			return this.resolveDest(dests[0]);
		}
		if (dests.length > 1) {
			const pick = await this.plugin.easyapi.dialog_suggest(
				dests.map((d) => d.name),
				dests,
				this.plugin.strings.prompt_feishu_dest
			);
			if (!pick) {
				throw new Error(this.plugin.strings.notice_feishu_no_dest);
			}
			return this.resolveDest(pick);
		}
		await this.pickDestination();
		const after = this.listDests();
		if (!after.length) {
			throw new Error(this.plugin.strings.notice_feishu_no_dest);
		}
		if (after.length === 1) {
			return this.resolveDest(after[0]);
		}
		return this.chooseDest();
	}

	private async sessionForLegacyBinding(
		binding: FeishuBinding,
		folderDest?: ResolvedDest
	): Promise<ResolvedDest> {
		const dests = this.listDests();
		const bySpace = dests.find((d) => d.spaceId && d.spaceId === binding.SpaceId);
		if (bySpace) {
			return this.resolveDest(bySpace);
		}
		for (const dest of dests) {
			this.useAccount(dest.account);
			try {
				await this.getNode(binding.NodeToken);
				return this.resolveDest(dest);
			} catch {
				/* try next account */
			}
		}
		if (folderDest) {
			return folderDest;
		}
		return this.ensureDestination();
	}

	private async resolveDest(dest: FeishuDest): Promise<ResolvedDest> {
		this.useAccount(dest.account);
		let parentNode = '';
		let spaceId = dest.spaceId;
		if (dest.parentRaw) {
			const parsed = this.parseWikiInput(dest.parentRaw);
			if (parsed.domain && !dest.account.domain) {
				dest.account.domain = parsed.domain;
			}
			if (parsed.spaceId && !spaceId) {
				spaceId = parsed.spaceId;
			}
			parentNode =
				parsed.nodeToken ||
				(dest.parentRaw.startsWith('http') ? '' : dest.parentRaw);
		}
		if (!spaceId && parentNode) {
			const node = await this.getNode(parentNode);
			spaceId = node.space_id;
			await this.persistDestMeta(dest.name, {
				spaceId,
				parentNode,
				domain: dest.account.domain,
			});
		}
		if (!spaceId) {
			throw new Error(this.plugin.strings.notice_feishu_no_dest);
		}
		return {
			name: dest.name,
			account: dest.account,
			spaceId,
			parentNode,
		};
	}

	private yamlField(raw: any, ...keys: string[]): string {
		if (!raw || typeof raw !== 'object') {
			return '';
		}
		for (const key of keys) {
			const v = raw[key];
			if (v != null && String(v).trim()) {
				return String(v).trim();
			}
		}
		return '';
	}

	private loadYamlObject(): Record<string, any> {
		const raw = (this.plugin.settings.feishu_destinations || '').trim();
		if (!raw) {
			return {};
		}
		let parsed: unknown;
		try {
			parsed = this.plugin.easyapi.editor.yamljs.load(raw);
		} catch {
			throw new Error(this.plugin.strings.notice_feishu_yaml_bad);
		}
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new Error(this.plugin.strings.notice_feishu_yaml_bad);
		}
		return parsed as Record<string, any>;
	}

	private listAccounts(): FeishuAccount[] {
		const cfg = this.loadYamlObject();
		const out: FeishuAccount[] = [];
		for (const [name, raw] of Object.entries(cfg)) {
			const appId = this.yamlField(raw, 'app_id', 'appId');
			const appSecret = this.yamlField(raw, 'app_secret', 'appSecret');
			if (!appId || !appSecret) {
				continue;
			}
			out.push({
				name,
				appId,
				appSecret,
				domain: this.yamlField(raw, 'domain').replace(/\/$/, ''),
			});
		}
		const legacy = this.legacyAccount();
		if (legacy && !out.some((a) => a.appId === legacy.appId)) {
			out.push(legacy);
		}
		return out;
	}

	private listDests(): FeishuDest[] {
		const cfg = this.loadYamlObject();
		const accounts = this.listAccounts();
		const byName = new Map(accounts.map((a) => [a.name, a]));
		const byAppId = new Map(accounts.map((a) => [a.appId, a]));
		const out: FeishuDest[] = [];
		for (const [name, raw] of Object.entries(cfg)) {
			const parentRaw = this.yamlField(raw, 'parent', 'parent_node');
			const spaceId = this.yamlField(raw, 'space_id', 'spaceId');
			if (!parentRaw && !spaceId) {
				continue;
			}
			const ref = this.yamlField(raw, 'account');
			let account = ref ? byName.get(ref) : undefined;
			if (!account) {
				account = byName.get(name);
			}
			if (!account) {
				const appId = this.yamlField(raw, 'app_id', 'appId');
				if (appId) {
					account = byAppId.get(appId);
				}
			}
			if (!account) {
				continue;
			}
			out.push({ name, account, parentRaw, spaceId });
		}
		if (!out.length) {
			const legacy = this.legacyDest();
			if (legacy) {
				out.push(legacy);
			}
		}
		return out;
	}

	private legacyAccount(): FeishuAccount | null {
		const appId = (this.plugin.settings.feishu_app_id || '').trim();
		const appSecret = (this.plugin.settings.feishu_app_secret || '').trim();
		if (!appId || !appSecret) {
			return null;
		}
		return {
			name: this.plugin.strings.item_feishu_legacy_dest,
			appId,
			appSecret,
			domain: (this.plugin.settings.feishu_domain || '').trim().replace(/\/$/, ''),
		};
	}

	private legacyDest(): FeishuDest | null {
		const account = this.legacyAccount();
		if (!account) {
			return null;
		}
		const parentRaw = (this.plugin.settings.feishu_parent_node || '').trim();
		const spaceId = (this.plugin.settings.feishu_space_id || '').trim();
		if (!parentRaw && !spaceId) {
			return null;
		}
		return {
			name: this.plugin.strings.item_feishu_legacy_dest,
			account,
			parentRaw,
			spaceId,
		};
	}

	private yamlKey(s: string): string {
		if (/^[\w.\u4e00-\u9fff-]+$/.test(s)) {
			return s;
		}
		return JSON.stringify(s);
	}

	private yamlScalar(s: string): string {
		if (/^-?\d+$/.test(s) || /[:#{}[\],&*?|>!%@`'"]/.test(s) || /\s/.test(s) || !s) {
			return JSON.stringify(s);
		}
		if (['true', 'false', 'null', 'yes', 'no', 'on', 'off'].includes(s.toLowerCase())) {
			return JSON.stringify(s);
		}
		return s;
	}

	private dumpYaml(cfg: Record<string, any>): string {
		const order = ['account', 'app_id', 'app_secret', 'domain', 'parent', 'space_id'];
		const chunks: string[] = [];
		for (const [name, raw] of Object.entries(cfg)) {
			if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
				continue;
			}
			const lines = [`${this.yamlKey(name)}:`];
			const seen = new Set<string>();
			for (const key of order) {
				if (raw[key] == null || String(raw[key]).trim() === '') {
					continue;
				}
				lines.push(`  ${key}: ${this.yamlScalar(String(raw[key]).trim())}`);
				seen.add(key);
			}
			for (const [key, value] of Object.entries(raw)) {
				if (seen.has(key) || value == null || String(value).trim() === '') {
					continue;
				}
				if (typeof value === 'object') {
					continue;
				}
				lines.push(`  ${key}: ${this.yamlScalar(String(value).trim())}`);
			}
			chunks.push(lines.join('\n'));
		}
		return chunks.join('\n\n') + (chunks.length ? '\n' : '');
	}

	private async persistDestMeta(
		name: string,
		meta: {
			spaceId?: string;
			parentNode?: string;
			domain?: string;
			account?: FeishuAccount;
		}
	) {
		const cfg = this.loadYamlObject();
		if (!cfg[name] || typeof cfg[name] !== 'object' || Array.isArray(cfg[name])) {
			cfg[name] = {};
		}
		if (meta.account) {
			const accName = meta.account.name;
			const accBlock = cfg[accName];
			const accHasCreds =
				accBlock &&
				typeof accBlock === 'object' &&
				this.yamlField(accBlock, 'app_id', 'appId');
			if (!accHasCreds) {
				cfg[accName] = {
					...(accBlock && typeof accBlock === 'object' ? accBlock : {}),
					app_id: meta.account.appId,
					app_secret: meta.account.appSecret,
				};
				if (meta.account.domain) {
					cfg[accName].domain = meta.account.domain;
				}
			}
			if (accName !== name) {
				cfg[name].account = accName;
			} else if (!this.yamlField(cfg[name], 'app_id', 'appId')) {
				cfg[name].app_id = meta.account.appId;
				cfg[name].app_secret = meta.account.appSecret;
			}
		}
		if (meta.spaceId) {
			cfg[name].space_id = meta.spaceId;
		}
		if (meta.parentNode) {
			const domain = (meta.domain || cfg[name].domain || '').replace(/\/$/, '');
			cfg[name].parent = domain
				? `${domain}/wiki/${meta.parentNode}`
				: meta.parentNode;
		}
		if (meta.domain && !cfg[name].account) {
			cfg[name].domain = meta.domain.replace(/\/$/, '');
		} else if (meta.domain && cfg[name].account && cfg[cfg[name].account]) {
			cfg[cfg[name].account].domain = meta.domain.replace(/\/$/, '');
		}
		this.plugin.settings.feishu_destinations = this.dumpYaml(cfg);
		await this.plugin.saveSettings();
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

	private readDestHint(tfile: TFile): string {
		const fm = this.plugin.app.metadataCache.getFileCache(tfile)?.frontmatter;
		const dest = fm?.[this.plugin.yaml]?.Feishu?.Dest;
		return dest ? String(dest).trim() : '';
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
		const account = this.currentAccount;
		if (!account?.appId || !account.appSecret) {
			throw new Error(this.plugin.strings.notice_feishu_no_app);
		}
		const cached = this.tokens.get(account.appId);
		if (!force && cached && Date.now() < cached.expireAt) {
			return cached.token;
		}
		const res = await requestUrl({
			url: `${FEISHU_API}/auth/v3/tenant_access_token/internal`,
			method: 'POST',
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
			body: JSON.stringify({ app_id: account.appId, app_secret: account.appSecret }),
			throw: false,
		});
		const json = this.parseJson(res);
		if (res.status >= 400 || json?.code) {
			throw new Error(json?.msg || `token HTTP ${res.status}`);
		}
		const token = json.tenant_access_token;
		const expireAt = Date.now() + Math.max(0, (json.expire || 7200) - 300) * 1000;
		this.tokens.set(account.appId, { token, expireAt });
		return token;
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

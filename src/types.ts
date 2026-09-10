import { App, CachedMetadata, Plugin, Pos, TFile, TFolder } from 'obsidian';

export interface NoteSyncFrontmatter {
	Dir?: string;
	Name?: string;
	Assets?: string;
	RemoveMeta?: boolean;
	UseGitLink?: boolean;
}

export interface GitRepoItem {
	type: string;
	path: string;
	download_url?: string;
}

export interface CommunityPlugins {
	plugins: Record<string, Plugin>;
	getPlugin: (id: string) => Plugin | null;
}

export interface AppWithPlugins {
	plugins: CommunityPlugins;
}

export interface CmSelection {
	from: number;
	to: number;
}

export interface EasyApiEditor {
	yamljs: { load: (src: string) => Record<string, unknown> | null };
	slice_by_position: (ctx: string, pos: Pos) => string;
}

export interface EasyApiTpl {
	parse_templater: (
		tpl: string,
		run: boolean,
		extra?: unknown,
		slice?: number[]
	) => Promise<string[]>;
}

export interface EasyApiFile {
	get_tfile: (name: string) => TFile | null;
	get_selected_files: () => TFile[];
	get_tfiles_of_folder: (folder: TFolder | null, n: number) => TFile[];
	get_all_tfiles_tags: (tag: string) => TFile[];
}

export interface EasyApiFs {
	select_valid_dir: (paths: string[]) => Promise<string | undefined>;
	isdir: (path: string) => boolean;
	fs: { existsSync: (p: string) => boolean; mkdirSync: (p: string) => void };
	path: { join: (...parts: string[]) => string; basename: (p: string) => string };
	list_dir: (dir: string, recursive: boolean) => string[];
	root: string;
	sync_tfile: (file: TFile, dst: string, mode: string, a: boolean, b: boolean) => void;
	sync_tfolder: (
		folder: TFolder,
		dst: string,
		mode: string,
		a: boolean,
		b: boolean,
		strict: boolean
	) => void;
	writeFile: (
		target: string,
		ctx: string,
		enc: string,
		cb: (err: Error) => void
	) => void;
	get_outlinks: (tfile: TFile, recursive: boolean) => TFile[];
	mkdir_recursive: (dir: string) => void;
	copy_tfile: (file: TFile, dst: string) => boolean;
	copy_file: (src: string, dst: string, mode: string) => boolean;
}

export interface EasyApi {
	dialog_prompt: (msg: string) => Promise<string>;
	dialog_suggest: {
		<T>(names: string[], values: T[], placeholder?: string): Promise<T | undefined>;
		<T>(
			names: string[],
			values: T[],
			placeholder: string | undefined,
			allowAll: true
		): Promise<T | 'all' | undefined>;
	};
	fs: EasyApiFs;
	file: EasyApiFile;
	editor: EasyApiEditor;
	tpl: EasyApiTpl;
	cfile: TFile | null;
	ccontent: Promise<string | null>;
	cmeta: CachedMetadata | null;
	ceditor: { cm: { state: { selection: { main: CmSelection } } } };
	nc: { chain: { sort_tfiles_by_chain: (files: TFile[]) => TFile[] } } | null;
}

export function getEasyApi(): EasyApi {
	return (window as unknown as { ea: EasyApi }).ea;
}

export function communityPlugins(app: App): CommunityPlugins {
	return (app as unknown as AppWithPlugins).plugins;
}

export function asGitRepoItems(data: unknown): GitRepoItem[] {
	const list = Array.isArray(data) ? data : [data];
	return list.filter((x): x is GitRepoItem => {
		if (!x || typeof x !== 'object') return false;
		const item = x as Record<string, unknown>;
		return typeof item.type === 'string' && typeof item.path === 'string';
	});
}

export function asNoteSyncFrontmatter(value: unknown): NoteSyncFrontmatter {
	if (!value || typeof value !== 'object') return {};
	return value as NoteSyncFrontmatter;
}

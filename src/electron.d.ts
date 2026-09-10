declare module 'electron' {
	export const remote: {
		dialog: {
			showSaveDialog: (options: {
				title?: string;
				defaultPath?: string;
				filters?: { name: string; extensions: string[] }[];
			}) => Promise<{ canceled: boolean; filePath?: string }>;
		};
	};
}

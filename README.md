
This plugin depends on: [Templater](https://github.com/SilentVoid13/Templater) and [NoteChain](https://github.com/zigholding/obsidian-notechain-plugin)

### Exporting Notes

Mirroring files or folders:
1. Right-click on the file or folder in the file list;
2. Click `Sync to other vault`;
3. Enter the target vault root directory;
4. Notes, folders, and attachments embedded in notes will be copied to the target vault following the same file structure. If a file with the same name exists in the target vault, it will be determined whether to overwrite based on the last modified time;

Exporting plugins:
1. `Note Sync: export plugin`
2. Select the plugin to export;
3. Choose whether to export `data.json`;
4. Enter the plugin save directory;
5. Press Enter to confirm.

### Exporting Notes as readMe

Execute `Note Sync:Set config to export note` to set export information:
- `Dir`: Export path
- `Name`: File name, default is readMe
- `Assets`: Attachment storage path
- `RemoveMeta`: Whether to remove metadata, default is true
- `UseGitLink`: Use Git format for attachment links, default is true

> [!NOTE]+ Example of file export configuration
> ```yaml
> note-sync:
>   Dir: D:\github\ObsidianZ-dev\.obsidian\plugins\note-sync
>   Name: readMe_en
>   Assets: ./assets
>   RemoveMeta: true
>   UseGitLink: true
> ```

Then execute `Note Sync:Export current note` to set the export note.

### Settings Page

![Pasted image 20241215125538.png](./assets/Pasted%20image%2020241215125538.png)

> [!NOTE]+ Root dir of vault
> When exporting plugins, right-click to sync files and select the preset vault. Use line breaks to separate multiple vaults.

> [!Danger]+ Strict mode
> When right-clicking to sync a folder, delete notes or attachments that are in the target folder but not in the source folder. This ensures that the synced folder and the current folder are the same. This setting will delete files, please operate with caution.

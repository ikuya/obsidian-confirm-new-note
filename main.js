"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const obsidian_1 = require("obsidian");
const DEFAULT_SETTINGS = {
    confirmUnresolvedLinks: true,
    confirmNewNoteCommands: true,
    commandIdPrefixes: "file-explorer:new-file",
    debug: false,
};
/* ------------------------------------------------------------------ */
/* i18n (ja / en)                                                      */
/* ------------------------------------------------------------------ */
function isJapanese() {
    var _a, _b;
    const lang = (_b = (_a = window.localStorage.getItem("language")) !== null && _a !== void 0 ? _a : navigator.language) !== null && _b !== void 0 ? _b : "";
    return lang.toLowerCase().startsWith("ja");
}
function t(ja, en) {
    return isJapanese() ? ja : en;
}
/* ------------------------------------------------------------------ */
/* Confirmation modal                                                  */
/* ------------------------------------------------------------------ */
class ConfirmModal extends obsidian_1.Modal {
    constructor(app, title, message, onDecision) {
        super(app);
        this.title = title;
        this.message = message;
        this.onDecision = onDecision;
        this.decided = false;
    }
    onOpen() {
        const { contentEl } = this;
        this.setTitle(this.title);
        contentEl.createEl("p", { text: this.message });
        new obsidian_1.Setting(contentEl)
            .addButton((b) => b.setButtonText(t("キャンセル", "Cancel")).onClick(() => this.decide(false)))
            .addButton((b) => b
            .setButtonText(t("作成する", "Create"))
            .setCta()
            .onClick(() => this.decide(true)));
        // Enter = create, Esc = cancel (Esc is handled by Modal -> onClose).
        this.scope.register([], "Enter", (evt) => {
            evt.preventDefault();
            this.decide(true);
            return false;
        });
    }
    onClose() {
        this.contentEl.empty();
        // Closed via Esc / click outside / X button -> treat as cancel.
        if (!this.decided) {
            this.decided = true;
            this.onDecision(false);
        }
    }
    decide(ok) {
        if (this.decided)
            return;
        this.decided = true;
        this.onDecision(ok);
        this.close();
    }
}
class ConfirmNewNotePlugin extends obsidian_1.Plugin {
    constructor() {
        super(...arguments);
        this.settings = { ...DEFAULT_SETTINGS };
        /** True while a confirmation modal is open (prevents stacked dialogs). */
        this.modalOpen = false;
        /** Set on unload so leftover wrappers become pass-through. */
        this.unloaded = false;
    }
    async onload() {
        await this.loadSettings();
        this.addSettingTab(new ConfirmNewNoteSettingTab(this.app, this));
        this.app.workspace.onLayoutReady(() => {
            this.patchOpenLinkText();
            this.patchNewNoteCommands();
        });
    }
    onunload() {
        this.unloaded = true;
        // Restore functions registered via this.register() run automatically.
    }
    /* ---------------- settings ---------------- */
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }
    async saveSettings() {
        await this.saveData(this.settings);
    }
    /* ---------------- helpers ---------------- */
    log(...args) {
        if (this.settings.debug)
            console.log("[confirm-new-note]", ...args);
    }
    /** Show the modal and resolve with the user's decision. */
    ask(title, message) {
        if (this.modalOpen)
            return Promise.resolve(false);
        this.modalOpen = true;
        return new Promise((resolve) => {
            new ConfirmModal(this.app, title, message, (ok) => {
                this.modalOpen = false;
                resolve(ok);
            }).open();
        });
    }
    /* ---------------- 1) links to non-existing notes ---------------- */
    /**
     * Obsidian opens (and creates, if missing) the target of a link through
     * workspace.openLinkText(). Wrapping it covers clicks in Reading view,
     * Live Preview, Source mode, the graph view, etc.
     */
    patchOpenLinkText() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ws = this.app.workspace;
        const original = ws.openLinkText;
        if (typeof original !== "function") {
            console.warn("[confirm-new-note] workspace.openLinkText not found; link guard disabled");
            return;
        }
        const hadOwn = Object.prototype.hasOwnProperty.call(ws, "openLinkText");
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        const wrapper = async function (...args) {
            const [linktext, sourcePath] = args;
            if (!self.unloaded && self.settings.confirmUnresolvedLinks && typeof linktext === "string") {
                const missing = self.findMissingTarget(linktext, sourcePath !== null && sourcePath !== void 0 ? sourcePath : "");
                self.log("openLinkText", { linktext, sourcePath, missing });
                if (missing !== null) {
                    const ok = await self.ask(t("新規ノートを作成しますか?", "Create a new note?"), t(`「${missing}」はまだ存在しません。新規ノートとして作成して開きますか?`, `"${missing}" does not exist yet. Create it and open it?`));
                    if (!ok)
                        return;
                }
            }
            return original.apply(ws, args);
        };
        ws.openLinkText = wrapper;
        this.register(() => {
            if (ws.openLinkText !== wrapper)
                return; // someone patched on top of us
            if (hadOwn)
                ws.openLinkText = original;
            else
                delete ws.openLinkText;
        });
    }
    /** Returns the link path if it points to nothing (so opening it would create a note). */
    findMissingTarget(linktext, sourcePath) {
        const { path } = (0, obsidian_1.parseLinktext)(linktext);
        if (!path)
            return null; // e.g. [[#Heading]] in the same note
        if (this.app.metadataCache.getFirstLinkpathDest(path, sourcePath))
            return null;
        if (this.app.vault.getAbstractFileByPath((0, obsidian_1.normalizePath)(path)))
            return null;
        return path;
    }
    /* ---------------- 2) "new note" commands ---------------- */
    patchNewNoteCommands() {
        var _a;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const registry = (_a = this.app.commands) === null || _a === void 0 ? void 0 : _a.commands;
        if (!registry) {
            console.warn("[confirm-new-note] command registry not found; command guard disabled");
            return;
        }
        const prefixes = this.settings.commandIdPrefixes
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        if (prefixes.length === 0)
            return;
        const run = (id, fn) => {
            if (this.unloaded || !this.settings.confirmNewNoteCommands) {
                fn();
                return;
            }
            this.log("command", id);
            void this.ask(t("新規ノートを作成しますか?", "Create a new note?"), t("新しいノートを作成します。よろしいですか?", "A new note will be created. Continue?")).then((ok) => {
                if (ok)
                    fn();
            });
        };
        for (const id of Object.keys(registry)) {
            if (!prefixes.some((p) => id.startsWith(p)))
                continue;
            const cmd = registry[id];
            if (typeof cmd.callback === "function") {
                const original = cmd.callback;
                const wrapped = () => run(id, () => original.call(cmd));
                cmd.callback = wrapped;
                this.register(() => {
                    if (cmd.callback === wrapped)
                        cmd.callback = original;
                });
            }
            else if (typeof cmd.checkCallback === "function") {
                const original = cmd.checkCallback;
                const wrapped = (checking) => {
                    if (checking)
                        return original.call(cmd, true);
                    if (!original.call(cmd, true))
                        return false;
                    run(id, () => original.call(cmd, false));
                    return true;
                };
                cmd.checkCallback = wrapped;
                this.register(() => {
                    if (cmd.checkCallback === wrapped)
                        cmd.checkCallback = original;
                });
            }
            else {
                this.log("skipped (no callback/checkCallback)", id);
            }
        }
    }
}
exports.default = ConfirmNewNotePlugin;
/* ------------------------------------------------------------------ */
/* Settings tab                                                        */
/* ------------------------------------------------------------------ */
class ConfirmNewNoteSettingTab extends obsidian_1.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        new obsidian_1.Setting(containerEl)
            .setName(t("存在しないリンクを開く前に確認", "Confirm before opening a link to a non-existing note"))
            .setDesc(t("リンクをクリックして新規ノートが自動作成される前に確認ダイアログを表示します。", "Show a dialog before a note is auto-created by following an unresolved link."))
            .addToggle((tg) => tg.setValue(this.plugin.settings.confirmUnresolvedLinks).onChange(async (v) => {
            this.plugin.settings.confirmUnresolvedLinks = v;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName(t("新規ノート作成コマンドの前に確認", "Confirm before new-note commands"))
            .setDesc(t("Ctrl/Cmd+N やコマンドパレットから新規ノートを作る前に確認します。", "Show a dialog before creating a note via Ctrl/Cmd+N or the command palette."))
            .addToggle((tg) => tg.setValue(this.plugin.settings.confirmNewNoteCommands).onChange(async (v) => {
            this.plugin.settings.confirmNewNoteCommands = v;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName(t("対象コマンドIDの前方一致(1行に1つ)", "Command ID prefixes to guard (one per line)"))
            .setDesc(t("変更は Obsidian の再読み込み(またはプラグインの無効→有効)後に反映されます。例: daily-notes, zk-prefixer", "Applied after reloading Obsidian (or toggling this plugin). Examples: daily-notes, zk-prefixer"))
            .addTextArea((ta) => {
            ta.setValue(this.plugin.settings.commandIdPrefixes).onChange(async (v) => {
                this.plugin.settings.commandIdPrefixes = v;
                await this.plugin.saveSettings();
            });
            ta.inputEl.rows = 4;
            ta.inputEl.cols = 32;
        });
        new obsidian_1.Setting(containerEl)
            .setName(t("デバッグログ", "Debug log"))
            .setDesc(t("インターセプトした内容を開発者コンソール(Ctrl/Cmd+Shift+I)に出力します。", "Log intercepted actions to the developer console (Ctrl/Cmd+Shift+I)."))
            .addToggle((tg) => tg.setValue(this.plugin.settings.debug).onChange(async (v) => {
            this.plugin.settings.debug = v;
            await this.plugin.saveSettings();
        }));
    }
}

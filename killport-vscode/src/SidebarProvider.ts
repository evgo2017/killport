import * as vscode from "vscode";
import * as cp from "child_process";
import * as util from "util";

const exec = util.promisify(cp.exec);

export class SidebarProvider implements vscode.WebviewViewProvider {
    _view?: vscode.WebviewView;
    _doc?: vscode.TextDocument;

    private _lastSearchedPort: string = "";

    // Localization Dictionary
    private _translations: any = {
        "en": {
            "searchPlaceholder": "Enter Port Number (e.g. 8080)",
            "searchBtn": "Search",
            "headerPid": "PID",
            "headerName": "Name",
            "headerProto": "Proto",
            "headerAction": "Action",
            "statusReady": "Ready",
            "statusSearching": "Searching for port",
            "statusFound": "Found {0} processes.",
            "statusNone": "No processes found.",
            "statusInvalid": "Invalid port number.",
            "statusError": "Error: {0}",
            "statusKilling": "Killing process {0}...",
            "statusKilled": "Killed process {0}.",
            "killBtn": "Kill",
            "confirmTitle": "Kill Process?",
            "confirmMsg": "Are you sure you want to kill this process?",
            "btnCancel": "Cancel",
            "btnConfirm": "Yes, Kill",
            "processLabel": "Process: ",
            "pidLabel": "PID: ",
            "catWebApp": "Frontend",
            "catBackend": "Backend",
            "catDatabase": "Database",
            "catSystem": "System"
        },
        "zh": {
            "searchPlaceholder": "输入端口号 (例如 8080)",
            "searchBtn": "搜索",
            "headerPid": "PID",
            "headerName": "进程名",
            "headerProto": "协议",
            "headerAction": "操作",
            "statusReady": "就绪",
            "statusSearching": "正在搜索端口",
            "statusFound": "找到 {0} 个进程。",
            "statusNone": "未找到进程。",
            "statusInvalid": "无效的端口号。",
            "statusError": "错误: {0}",
            "statusKilling": "正在结束进程 {0}...",
            "statusKilled": "已结束进程 {0}。",
            "killBtn": "关闭进程",
            "confirmTitle": "确认结束进程",
            "confirmMsg": "确定要结束这个进程吗？",
            "btnCancel": "取消",
            "btnConfirm": "确认关闭",
            "processLabel": "进程: ",
            "pidLabel": "PID: ",
            "catWebApp": "前端",
            "catBackend": "后端",
            "catDatabase": "数据库",
            "catSystem": "系统"
        }
    };

    constructor(private readonly _extensionUri: vscode.Uri) { }

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case "search": {
                    const port = data.value;
                    this._lastSearchedPort = port;
                    this.searchProcesses(port);
                    break;
                }
                case "kill": {
                    const pid = data.value;
                    this.killProcess(pid);
                    break;
                }
                case "clear": {
                    this._lastSearchedPort = "";
                    this._view?.webview.postMessage({ type: "clearProcesses" });
                    this._view?.webview.postMessage({ type: "status", key: "statusReady" });
                    break;
                }
            }
        });
    }

    private async searchProcesses(port: string) {
        if (!port || isNaN(parseInt(port))) {
            this._view?.webview.postMessage({ type: "status", key: "statusInvalid" });
            return;
        }

        this._view?.webview.postMessage({ type: "status", key: "statusSearching", args: [port] });
        this._view?.webview.postMessage({ type: "clearProcesses" });

        try {
            const isWindows = process.platform === 'win32';
            const processes = [];

            if (isWindows) {
                try {
                    const { stdout } = await exec(`netstat -ano | findstr :${port}`);
                    const lines = stdout.split('\n').filter(line => line.trim() !== '');

                    for (const line of lines) {
                        const parts = line.trim().split(/\s+/);
                        if (parts.length >= 5) {
                            const protocol = parts[0];
                            const localAddress = parts[1];
                            const pid = parts[parts.length - 1];

                            if (localAddress.endsWith(`:${port}`)) {
                                let processName = "Unknown";
                                try {
                                    const { stdout: taskOut } = await exec(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`);
                                    const taskParts = taskOut.trim().split(',');
                                    if (taskParts.length > 0) {
                                        processName = taskParts[0].replace(/"/g, '');
                                    }
                                } catch (e) { }

                                processes.push({ port, pid, processName, protocol });
                            }
                        }
                    }
                } catch (e) { }
            } else {
                try {
                    const { stdout } = await exec(`lsof -i :${port}`);
                    const lines = stdout.split('\n').filter(line => line.trim() !== '');
                    for (let i = 1; i < lines.length; i++) {
                        const parts = lines[i].trim().split(/\s+/);
                        if (parts.length >= 2) {
                            const processName = parts[0];
                            const pid = parts[1];
                            const protocol = parts[4] || "TCP/UDP";
                            processes.push({ port, pid, processName, protocol });
                        }
                    }
                } catch (e) { }
            }

            const uniqueProcesses = processes.filter((v, i, a) => a.findIndex(t => t.pid === v.pid) === i);

            if (uniqueProcesses.length > 0) {
                this._view?.webview.postMessage({ type: "processes", value: uniqueProcesses });
                this._view?.webview.postMessage({ type: "status", key: "statusFound", args: [uniqueProcesses.length.toString()] });
            } else {
                this._view?.webview.postMessage({ type: "status", key: "statusNone" });
            }

        } catch (error: any) {
            this._view?.webview.postMessage({ type: "status", key: "statusError", args: [error.message] });
        }
    }

    private async killProcess(pid: string) {
        if (!pid) return;
        this._view?.webview.postMessage({ type: "status", key: "statusKilling", args: [pid] });
        try {
            const isWindows = process.platform === 'win32';
            if (isWindows) {
                await exec(`taskkill /F /PID ${pid}`);
            } else {
                await exec(`kill -9 ${pid}`);
            }

            this._view?.webview.postMessage({ type: "status", key: "statusKilled", args: [pid] });

            if (this._lastSearchedPort) {
                setTimeout(() => {
                    this.searchProcesses(this._lastSearchedPort);
                }, 1000);
            }

        } catch (error: any) {
            this._view?.webview.postMessage({ type: "status", key: "statusError", args: [error.message] });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "media", "reset.css"));
        const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "media", "vscode.css"));
        const translationsStr = JSON.stringify(this._translations);

        return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: var(--vscode-font-family); padding: 10px; color: var(--vscode-foreground); }
                    .container { display: flex; flex-direction: column; gap: 15px; }
                    .search-box { display: flex; gap: 10px; }
                    input { 
                        flex: 1; 
                        padding: 8px; 
                        padding-right: 24px;
                        background: var(--vscode-input-background); 
                        color: var(--vscode-input-foreground); 
                        border: 1px solid var(--vscode-input-border);
                        outline: none;
                    }
                    input:focus { border-color: var(--vscode-focusBorder); }
                    button {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 8px 15px;
                        cursor: pointer;
                    }
                    button:hover { background: var(--vscode-button-hoverBackground); }
                    .process-list {
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        overflow: hidden;
                    }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { text-align: left; padding: 8px; font-size: 12px; border-bottom: 1px solid var(--vscode-panel-border); }
                    th { background: var(--vscode-editor-background); font-weight: bold; }
                    tr:last-child td { border-bottom: none; }
                    .kill-btn {
                        background: #FF4D4D;
                        color: white;
                        font-size: 11px;
                        padding: 4px 8px;
                    }
                    .kill-btn:hover { background: #E60000; }
                    .status-bar { 
                        font-size: 12px; 
                        color: var(--vscode-descriptionForeground); 
                        margin-top: 5px; 
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }

                    /* Language Toggle */
                    .lang-toggle {
                        cursor: pointer;
                        font-size: 11px;
                        border: 1px solid var(--vscode-input-border);
                        padding: 5px 8px;
                        border-radius: 3px;
                        background: var(--vscode-dropdown-background);
                        color: var(--vscode-dropdown-foreground);
                        min-width: 60px;
                        text-align: center;
                    }
                    .lang-toggle:hover {
                        background: var(--vscode-list-hoverBackground);
                        color: var(--vscode-list-hoverForeground);
                    }

                    /* Confirmation Overlay */
                    .overlay {
                        position: fixed;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(0, 0, 0, 0.5);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 100;
                        visibility: hidden;
                        opacity: 0;
                        transition: opacity 0.2s;
                    }
                    .overlay.visible {
                        visibility: visible;
                        opacity: 1;
                    }
                    .confirm-box {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        padding: 15px;
                        border-radius: 5px;
                        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
                        width: 80%;
                        max-width: 300px;
                        text-align: center;
                        top: 200px;
                        position: absolute;
                    }
                    .confirm-title {
                        font-weight: bold;
                        margin-bottom: 10px;
                        font-size: 14px;
                    }
                    .confirm-msg {
                        margin-bottom: 15px;
                        font-size: 13px;
                    }
                    .confirm-actions {
                        display: flex;
                        justify-content: center;
                        gap: 10px;
                    }
                    .btn-cancel {
                        background: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                    }
                    .btn-cancel:hover {
                         background: var(--vscode-button-secondaryHoverBackground);
                    }
                    .confirm-details {
                        text-align: left;
                        margin-bottom: 15px;
                        font-size: 13px;
                        background: var(--vscode-textBlockQuote-background);
                        padding: 10px;
                        border-radius: 4px;
                    }
                    .confirm-details div { margin-bottom: 5px; }
                    
                    /* Custom Suggestions List */
                    /* Search Box Layout */
                    .search-box {
                        display: flex;
                        gap: 8px;
                        margin-bottom: 5px;
                        align-items: center; /* Ensure vertical alignment */
                    }
                    .suggestions-wrapper {
                        position: relative;
                        flex: 1; /* Input takes remaining space */
                        min-width: 0; /* Handle overflow in flex items */
                        display: flex; /* Allow input to fill wrapper */
                    }
                    input {
                        flex: 1; /* Input fills wrapper */
                        padding: 8px;
                        padding-right: 30px; /* Space for clear button */
                        box-sizing: border-box; /* Include padding in width */
                        width: 100%;
                    }
                    button#searchBtn {
                        padding: 8px 16px;
                        white-space: nowrap; /* Prevent button text wrapping */
                        flex-shrink: 0; /* Button stays fixed width based on content */
                    }
                    
                    /* Clear Button Inside Input */
                    .clear-btn {
                        position: absolute;
                        right: 8px; /* Position inside input */
                        top: 50%;
                        transform: translateY(-50%);
                        background: none;
                        border: none;
                        color: var(--vscode-descriptionForeground);
                        cursor: pointer;
                        font-size: 16px;
                        padding: 0;
                        display: none;
                        line-height: 1;
                        z-index: 10; /* Ensure above input */
                    }
                    .clear-btn.visible {
                        display: block;
                    }

                    /* Custom Suggestions List */
                    .suggestions-list {
                        position: absolute;
                        top: 100%;
                        left: 0;
                        right: 0;
                        background: var(--vscode-dropdown-background);
                        border: 1px solid var(--vscode-dropdown-border);
                        z-index: 1000;
                        max-height: 300px;
                        overflow-y: auto;
                        display: none;
                        margin: 0;
                        padding: 0;
                        list-style: none;
                        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                    } 
                    .suggestions-list.visible {
                        display: block;
                    }
                    .suggestion-category {
                        display: flex;
                        padding: 8px 10px;
                        border-bottom: 1px solid var(--vscode-dropdown-border);
                    }
                    .suggestion-category:last-child {
                        border-bottom: none;
                    }
                    .category-name {
                        width: 60px;
                        font-weight: bold;
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                        margin-right: 10px; /* Space between name and ports */
                        display: flex;
                        align-items: center;
                        flex-shrink: 0;
                    }
                    .category-ports {
                        flex: 1;
                        display: flex;
                        flex-wrap: wrap;
                        gap: 6px;
                    }
                    .port-tag {
                        background: var(--vscode-badge-background);
                        color: var(--vscode-badge-foreground);
                        padding: 3px 8px;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 12px;
                        border: 1px solid transparent;
                    }
                    .port-tag:hover {
                        border-color: var(--vscode-focusBorder);
                        background: var(--vscode-list-hoverBackground);
                    }

                    .suggestions-wrapper { position: relative; flex: 1; }
                </style>
			</head>
			<body>
                <div class="container">
                    <div class="search-box">
                        <div class="suggestions-wrapper">
                            <input type="text" id="portInput" placeholder="Enter Port Number (e.g. 8080)" autocomplete="off" />
                            <span id="clearBtn" class="clear-btn" title="Clear">✕</span>
                            <div class="suggestions-list" id="suggestionsList">
                                <!-- WebApp -->
                                <div class="suggestion-category">
                                    <div class="category-name" data-i18n="catWebApp">WebApp</div>
                                    <div class="category-ports">
                                        <span class="port-tag" data-value="3000" title="React/Next.js/Nuxt.js">3000</span>
                                        <span class="port-tag" data-value="4200" title="Angular">4200</span>
                                        <span class="port-tag" data-value="5173" title="Vite(Vue3/Svelte)">5173</span>
                                        <span class="port-tag" data-value="8080" title="Vue CLI">8080</span>
                                    </div>
                                </div>
                                <!-- Backend -->
                                <div class="suggestion-category">
                                    <div class="category-name" data-i18n="catBackend">Backend</div>
                                    <div class="category-ports">
                                        <span class="port-tag" data-value="3000" title="Node">3000</span>
                                        <span class="port-tag" data-value="5000" title="ASP.NET/Flask">5000</span>
                                        <span class="port-tag" data-value="8000" title="Django/FastAPI/Laravel">8000</span>
                                        <span class="port-tag" data-value="8080" title="Spring/Tomcat">8080</span>
                                    </div>
                                </div>
                                <!-- Database -->
                                <div class="suggestion-category">
                                    <div class="category-name" data-i18n="catDatabase">Database</div>
                                    <div class="category-ports">
                                        <span class="port-tag" data-value="3306" title="MySQL">3306</span>
                                        <span class="port-tag" data-value="5432" title="PostgreSQL">5432</span>
                                        <span class="port-tag" data-value="6379" title="Redis">6379</span>
                                        <span class="port-tag" data-value="27017" title="MongoDB">27017</span>
                                    </div>
                                </div>
                                <!-- System -->
                                <div class="suggestion-category">
                                    <div class="category-name" data-i18n="catSystem">System</div>
                                    <div class="category-ports">
                                        <span class="port-tag" data-value="80" title="HTTP">80</span>
                                        <span class="port-tag" data-value="443" title="HTTPS">443</span>
                                        <span class="port-tag" data-value="21" title="FTP">21</span>
                                        <span class="port-tag" data-value="22" title="SSH">22</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <button id="searchBtn">Search</button>
                    </div>

                    <div class="process-list">
                        <table>
                            <thead>
                                <tr>
                                    <th data-i18n="headerPid">PID</th>
                                    <th data-i18n="headerName">Name</th>
                                    <th data-i18n="headerProto">Proto</th>
                                    <th data-i18n="headerAction">Action</th>
                                </tr>
                            </thead>
                            <tbody id="processTableBody">
                                <!-- Rows will be here -->
                            </tbody>
                        </table>
                    </div>

                    <div class="status-bar">
                        <span id="statusBar" data-i18n="statusReady">Ready</span>
                        <button class="lang-toggle" id="langToggle">English</button>
                    </div>
                    
                    <!-- Confirmation Modal -->
                    <div class="overlay" id="confirmOverlay">
                        <div class="confirm-box">
                            <div class="confirm-title" data-i18n="confirmTitle">Kill Process?</div>
                            <div class="confirm-msg" id="confirmMsg" data-i18n="confirmMsg">Are you sure you want to kill this process?</div>
                            <div class="confirm-details">
                                <div><span data-i18n="processLabel">Process: </span><span id="confirmProcName" style="font-weight:bold"></span></div>
                                <div><span data-i18n="pidLabel">PID: </span><span id="confirmProcId" style="color:var(--vscode-descriptionForeground)"></span></div>
                            </div>
                            <div class="confirm-actions">
                                <button class="btn-cancel" id="btnCancel" data-i18n="btnCancel">Cancel</button>
                                <button class="kill-btn" id="btnConfirmKill" data-i18n="btnConfirm">Yes, Kill</button>
                            </div>
                        </div>
                    </div>
                </div>

				<script>
                    const vscode = acquireVsCodeApi();
                    const translations = ${translationsStr};
                    let currentLang = 'en';

                    // Elements
                    const portInput = document.getElementById('portInput');
                    const clearBtn = document.getElementById('clearBtn');
                    const searchBtn = document.getElementById('searchBtn');
                    const tableBody = document.getElementById('processTableBody');
                    const statusBar = document.getElementById('statusBar');
                    const langToggle = document.getElementById('langToggle');
                    
                    // Overlay elements
                    const confirmOverlay = document.getElementById('confirmOverlay');
                    const confirmMsg = document.getElementById('confirmMsg');
                    const confirmProcName = document.getElementById('confirmProcName');
                    const confirmProcId = document.getElementById('confirmProcId');
                    const btnCancel = document.getElementById('btnCancel');
                    const btnConfirmKill = document.getElementById('btnConfirmKill');

                    let processToKill = null;

                    // I18n Helper
                    function t(key, args = []) {
                        let text = translations[currentLang][key] || key;
                        args.forEach((arg, i) => {
                            text = text.replace('{' + i + '}', arg);
                        });
                        return text;
                    }

                    function updateUI() {
                        // Static elements
                        document.querySelectorAll('[data-i18n]').forEach(el => {
                            const key = el.getAttribute('data-i18n');
                            el.innerText = t(key);
                        });
                        
                        // Input placeholder
                        portInput.placeholder = t('searchPlaceholder');
                        searchBtn.innerText = t('searchBtn');

                        // Language toggle text
                        langToggle.textContent = currentLang === 'en' ? 'English' : '中文';
                        
                        // Table headers (handled by data-i18n above)
                        
                        // Status bar if it has a key stored
                        const statusKey = statusBar.getAttribute('data-key');
                        if (statusKey) {
                            const args = JSON.parse(statusBar.getAttribute('data-args') || '[]');
                            statusBar.innerText = t(statusKey, args);
                        }
                    }

                    function setLanguage(lang) {
                        currentLang = lang;
                        updateUI();
                    }

                    // Language Toggle Event
                    langToggle.addEventListener('click', () => {
                        const newLang = currentLang === 'en' ? 'zh' : 'en';
                        setLanguage(newLang);
                    });


                    searchBtn.addEventListener('click', () => {
                        const value = portInput.value;
                        if(value) {
                            vscode.postMessage({ type: 'search', value: value });
                        }
                    });

                    portInput.addEventListener('keydown', (e) => {
                         if (e.key === 'Enter') {
                            const value = portInput.value;
                            if(value) {
                                vscode.postMessage({ type: 'search', value: value });
                                suggestionsList.classList.remove('visible'); // Hide on enter
                            }
                         }
                    });

                    // Custom Dropdown Logic
                    const suggestionsList = document.getElementById('suggestionsList');

                    portInput.addEventListener('focus', () => {
                        suggestionsList.classList.add('visible');
                    });

                    // Hide delayed to allow click event to register
                    portInput.addEventListener('blur', () => {
                        setTimeout(() => {
                            suggestionsList.classList.remove('visible');
                        }, 200);
                    });

                    suggestionsList.querySelectorAll('.port-tag').forEach(tag => {
                        tag.addEventListener('click', () => {
                            const val = tag.getAttribute('data-value');
                            portInput.value = val;
                            suggestionsList.classList.remove('visible');
                            updateClearBtn();
                            vscode.postMessage({ type: 'search', value: val });
                        });
                    });

                    // Clear toggle
                    function updateClearBtn() {
                        if (portInput.value) clearBtn.classList.add('visible');
                        else clearBtn.classList.remove('visible');
                    }
                    portInput.addEventListener('input', () => {
                        updateClearBtn();
                        suggestionsList.classList.add('visible');
                    });
                    
                    clearBtn.addEventListener('click', () => {
                        portInput.value = '';
                        updateClearBtn();
                        portInput.focus();
                        vscode.postMessage({ type: 'clear' });
                    });

                    // Confirmation Logic
                    function showConfirm(pid, name) {
                        processToKill = pid;
                        confirmMsg.innerText = t('confirmMsg');
                        confirmProcName.innerText = name || 'Unknown';
                        confirmProcId.innerText = pid;
                        confirmOverlay.classList.add('visible');
                    }

                    function hideConfirm() {
                        processToKill = null;
                        confirmOverlay.classList.remove('visible');
                    }

                    btnCancel.addEventListener('click', hideConfirm);

                    btnConfirmKill.addEventListener('click', () => {
                        if (processToKill) {
                            vscode.postMessage({ type: 'kill', value: processToKill });
                            hideConfirm();
                        }
                    });

                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.type) {
                            case 'status':
                                if (message.key) {
                                    statusBar.setAttribute('data-key', message.key);
                                    statusBar.setAttribute('data-args', JSON.stringify(message.args || []));
                                    statusBar.innerText = t(message.key, message.args || []);
                                } else {
                                    // Fallback for legacy plain text messages if any
                                    statusBar.innerText = message.value;
                                }
                                break;
                            case 'clearProcesses':
                                tableBody.innerHTML = '';
                                break;
                            case 'processes':
                                message.value.forEach(p => {
                                    const tr = document.createElement('tr');
                                    tr.innerHTML = \`
                                        <td>\${p.pid}</td>
                                        <td>\${p.processName}</td>
                                        <td>\${p.protocol}</td>
                                        <td><button class="kill-btn" data-i18n="killBtn">\${t('killBtn')}</button></td>
                                    \`;
                                    const btn = tr.querySelector('.kill-btn');
                                    btn.onclick = () => {
                                        showConfirm(p.pid, p.processName);
                                    };
                                    tableBody.appendChild(tr);
                                });
                                break;
                        }
                    });
                    
                    // Initial UI update
                    updateUI();
                </script>
			</body>
			</html>`;
    }
}

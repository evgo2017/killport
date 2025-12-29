import * as vscode from "vscode";
import * as cp from "child_process";
import * as util from "util";

const exec = util.promisify(cp.exec);

export class SidebarProvider implements vscode.WebviewViewProvider {
    _view?: vscode.WebviewView;
    _doc?: vscode.TextDocument;

    private _lastSearchedPort: string = "";

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
            }
        });
    }

    private async searchProcesses(port: string) {
        if (!port || isNaN(parseInt(port))) {
            this._view?.webview.postMessage({ type: "status", value: "Invalid port number." });
            return;
        }

        this._view?.webview.postMessage({ type: "status", value: `Searching for port ${port}...` });
        this._view?.webview.postMessage({ type: "clearProcesses" });

        try {
            const isWindows = process.platform === 'win32';
            const processes = [];

            if (isWindows) {
                // Windows-specific logic using netstat
                // netstat -ano | findstr :<PORT>
                try {
                    const { stdout } = await exec(`netstat -ano | findstr :${port}`);
                    const lines = stdout.split('\n').filter(line => line.trim() !== '');

                    for (const line of lines) {
                        const parts = line.trim().split(/\s+/);
                        // TCP    0.0.0.0:8080           0.0.0.0:0              LISTENING       1234
                        if (parts.length >= 5) {
                            const protocol = parts[0];
                            const localAddress = parts[1];
                            const pid = parts[parts.length - 1];

                            // Check if it actually matches the port (exact match on :port end)
                            if (localAddress.endsWith(`:${port}`)) {
                                let processName = "Unknown";
                                try {
                                    const { stdout: taskOut } = await exec(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`);
                                    // "Image Name","PID"
                                    // "python.exe","1234",...
                                    const taskParts = taskOut.trim().split(',');
                                    if (taskParts.length > 0) {
                                        processName = taskParts[0].replace(/"/g, '');
                                    }
                                } catch (e) {
                                    // Ignore tasklist error
                                }

                                processes.push({ port, pid, processName, protocol });
                            }
                        }
                    }
                } catch (e) {
                    // findstr returns error if not found
                }
            } else {
                // Unix (Linux/Mac) logic using lsof
                // lsof -i :<PORT>
                try {
                    const { stdout } = await exec(`lsof -i :${port}`);
                    const lines = stdout.split('\n').filter(line => line.trim() !== '');
                    // COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
                    // node    12345 user   20u  IPv4 123456      0t0  TCP *:8080 (LISTEN)

                    // Skip header
                    for (let i = 1; i < lines.length; i++) {
                        const parts = lines[i].trim().split(/\s+/);
                        if (parts.length >= 2) {
                            const processName = parts[0];
                            const pid = parts[1];
                            const protocol = parts[4] || "TCP/UDP"; // Rough guess or parsing

                            processes.push({ port, pid, processName, protocol });
                        }
                    }
                } catch (e) {
                    // lsof returns error if not found
                }
            }

            // Remove duplicates based on PID
            const uniqueProcesses = processes.filter((v, i, a) => a.findIndex(t => t.pid === v.pid) === i);

            if (uniqueProcesses.length > 0) {
                this._view?.webview.postMessage({ type: "processes", value: uniqueProcesses });
                this._view?.webview.postMessage({ type: "status", value: `Found ${uniqueProcesses.length} processes.` });
            } else {
                this._view?.webview.postMessage({ type: "status", value: "No processes found." });
            }

        } catch (error: any) {
            this._view?.webview.postMessage({ type: "status", value: `Error: ${error.message}` });
        }
    }

    private async killProcess(pid: string) {
        if (!pid) return;
        this._view?.webview.postMessage({ type: "status", value: `Killing process ${pid}...` });
        try {
            const isWindows = process.platform === 'win32';
            if (isWindows) {
                await exec(`taskkill /F /PID ${pid}`);
            } else {
                await exec(`kill -9 ${pid}`);
            }

            this._view?.webview.postMessage({ type: "status", value: `Killed process ${pid}.` });

            // Refresh list if we have a port
            if (this._lastSearchedPort) {
                // Short delay to allow process to fully terminate and OS to update socket state
                setTimeout(() => {
                    this.searchProcesses(this._lastSearchedPort);
                }, 1000);
            }

        } catch (error: any) {
            this._view?.webview.postMessage({ type: "status", value: `Error: ${error.message}` });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "media", "reset.css"));
        const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "media", "vscode.css"));

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
                    .status-bar { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 5px; }
                </style>
			</head>
			<body>
                <div class="container">
                    <div class="search-box">
                        <input type="text" id="portInput" placeholder="Enter Port Number (e.g. 8080)" />
                        <button id="searchBtn">Search</button>
                    </div>

                    <div class="process-list">
                        <table>
                            <thead>
                                <tr>
                                    <th>PID</th>
                                    <th>Name</th>
                                    <th>Proto</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody id="processTableBody">
                                <!-- Rows will be here -->
                            </tbody>
                        </table>
                    </div>

                    <div class="status-bar" id="statusBar">Ready</div>
                </div>

				<script>
                    const vscode = acquireVsCodeApi();
                    const portInput = document.getElementById('portInput');
                    const searchBtn = document.getElementById('searchBtn');
                    const tableBody = document.getElementById('processTableBody');
                    const statusBar = document.getElementById('statusBar');

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
                            }
                         }
                    });

                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.type) {
                            case 'status':
                                statusBar.innerText = message.value;
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
                                        <td><button class="kill-btn" onclick="killProcess('\${p.pid}')">Kill</button></td>
                                    \`;
                                    // Binding click event properly
                                    const btn = tr.querySelector('.kill-btn');
                                    btn.onclick = () => {
                                        vscode.postMessage({ type: 'kill', value: p.pid });
                                    };
                                    tableBody.appendChild(tr);
                                });
                                break;
                        }
                    });
                </script>
			</body>
			</html>`;
    }
}

import * as vscode from "vscode";
import { BedrockMantleProvider } from "./provider";
import { BedrockDashboardPanel } from "./dashboard";

export class BedrockSidebarProvider implements vscode.WebviewViewProvider {
	public static readonly viewId = "aws-bedrock-bridge.sidebar";
	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _provider: BedrockMantleProvider
	) {}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(async (message) => {
			switch (message.command) {
				case "open-dashboard":
					vscode.commands.executeCommand("bedrock-bridge-copilot.showDashboard");
					break;
				case "run-diagnostics":
					vscode.commands.executeCommand("bedrock-bridge-copilot.testAccess");
					break;
				case "save-onboarding":
					const config = vscode.workspace.getConfiguration("aws-bedrock");
					await config.update("region", message.config.region, vscode.ConfigurationTarget.Global);
					await config.update("awsProfile", message.config.awsProfile, vscode.ConfigurationTarget.Global);
					
					if (message.config.apiKey !== undefined && message.config.apiKey !== "••••••••") {
						if (message.config.apiKey.trim() === "") {
							await this._provider.clearApiKey();
						} else {
							await this._provider.setApiKey(message.config.apiKey);
						}
					}
					
					vscode.window.showInformationMessage("AWS Bedrock Bridge onboarding configurations saved.");
					this.updateState();
					if (BedrockDashboardPanel.currentPanel) {
						BedrockDashboardPanel.currentPanel.updateState();
					}
					break;
			}
		});

		// Listen to provider events to refresh the onboarding checklist in real-time
		this._provider.onDidUpdateTokenUsage(async () => {
			this.updateState();
		});

		this._provider.onDidChangeLanguageModelChatInformation(async () => {
			this.updateState();
		});

		// Initial load
		setTimeout(() => {
			this.updateState();
		}, 100);
	}

	public async updateState() {
		if (!this._view) {
			return;
		}
		const config = vscode.workspace.getConfiguration("aws-bedrock");
		
		let hasApiKey = false;
		try {
			const key = await this._provider.secrets.get("bedrock.apiKey");
			hasApiKey = !!key;
		} catch (e) {}

		// Check if diagnostics has run
		const cache = this._provider.getModelAccessCache();
		const diagnosticsRun = cache.length > 0;
		const verifiedCount = cache.filter(c => c.status === "accessible").length;

		this._view.webview.postMessage({
			command: "state",
			state: {
				region: config.get<string>("region", "us-east-1"),
				profile: config.get<string>("awsProfile", "default"),
				hasApiKey,
				diagnosticsRun,
				verifiedCount,
				totalCount: this._provider.getModelsList().length
			}
		});
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<style>
		@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
		
		body {
			font-family: 'Inter', var(--vscode-editor-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
			font-size: 13px;
			color: var(--vscode-foreground, #1e293b);
			background-color: var(--vscode-sideBar-background, #ffffff);
			margin: 0;
			padding: 16px;
			line-height: 1.4;
		}

		.title {
			font-size: 16px;
			font-weight: 700;
			color: var(--vscode-editor-foreground, #0f172a);
			margin-bottom: 4px;
		}

		.subtitle {
			font-size: 11px;
			color: var(--vscode-descriptionForeground, #64748b);
			margin-bottom: 20px;
		}

		/* Checklist styling */
		.checklist {
			display: flex;
			flex-direction: column;
			gap: 12px;
			margin-bottom: 24px;
		}

		.step-item {
			background: var(--vscode-welcomePage-tileBackground, rgba(120, 120, 120, 0.04));
			border: 1px solid var(--vscode-widget-border, rgba(120, 120, 120, 0.08));
			border-radius: 8px;
			padding: 12px;
			display: flex;
			flex-direction: column;
			gap: 6px;
		}

		.step-header {
			display: flex;
			align-items: center;
			gap: 8px;
			font-weight: 600;
			font-size: 12px;
			color: var(--vscode-editor-foreground, #0f172a);
		}

		.step-desc {
			font-size: 11px;
			color: var(--vscode-descriptionForeground, #64748b);
			padding-left: 20px;
		}

		.checkbox-circle {
			width: 14px;
			height: 14px;
			border-radius: 50%;
			border: 2px solid var(--vscode-widget-border, #cbd5e1);
			display: inline-block;
			flex-shrink: 0;
		}

		.checkbox-circle.checked {
			background-color: #16a34a;
			border-color: #16a34a;
		}

		/* Quick Config inputs */
		.form-group {
			display: flex;
			flex-direction: column;
			gap: 4px;
			margin-bottom: 12px;
		}

		label {
			font-size: 10px;
			font-weight: 600;
			text-transform: uppercase;
			color: var(--vscode-descriptionForeground, #64748b);
		}

		input[type="text"], input[type="password"], select {
			background-color: var(--vscode-input-background, #f8fafc);
			color: var(--vscode-input-foreground, #0f172a);
			border: 1px solid var(--vscode-input-border, #cbd5e1);
			padding: 6px 10px;
			border-radius: 5px;
			font-size: 12px;
			outline: none;
			font-family: 'Inter', sans-serif;
		}

		input[type="text"]:focus, select:focus {
			border-color: #007acc;
		}

		/* Buttons */
		.btn {
			background-color: #007acc;
			color: #ffffff;
			border: 1px solid #007acc;
			padding: 8px 12px;
			border-radius: 5px;
			cursor: pointer;
			font-weight: 600;
			font-size: 12px;
			width: 100%;
			font-family: 'Inter', sans-serif;
		}

		.btn:hover {
			background-color: #0062a3;
		}

		.btn-secondary {
			background-color: transparent;
			color: var(--vscode-foreground);
			border: 1px solid var(--vscode-widget-border, #cbd5e1);
			margin-top: 8px;
		}

		.btn-secondary:hover {
			background-color: var(--vscode-button-secondaryBackground, #f1f5f9);
		}
	</style>
</head>
<body>
	<div class="title">AWS Bedrock Bridge</div>
	<div class="subtitle">Onboarding & Quick Setup</div>

	<div class="checklist">
		<!-- Step 1: Set Region -->
		<div class="step-item">
			<div class="step-header">
				<span class="checkbox-circle" id="check-step1"></span>
				<span>Step 1: Set AWS Region</span>
			</div>
			<div class="step-desc">Select the active Bedrock region for your workspace.</div>
		</div>

		<!-- Step 2: Credentials -->
		<div class="step-item">
			<div class="step-header">
				<span class="checkbox-circle" id="check-step2"></span>
				<span>Step 2: Authenticate Session</span>
			</div>
			<div class="step-desc">Establish AWS CLI credentials (SSO/default) or save a Mantle Proxy API Key.</div>
		</div>

		<!-- Step 3: Run diagnostics -->
		<div class="step-item">
			<div class="step-header">
				<span class="checkbox-circle" id="check-step3"></span>
				<span>Step 3: Run diagnostics</span>
			</div>
			<div class="step-desc">Test model access permissions to verify which models are available.</div>
		</div>
	</div>

	<!-- Quick Settings Editor inside Sidebar -->
	<div style="margin-top: 20px; border-top: 1px solid var(--vscode-widget-border, #e2e8f0); padding-top: 16px;">
		<div class="form-group">
			<label for="side-region">AWS Region</label>
			<select id="side-region">
				<option value="us-east-1">us-east-1 (N. Virginia)</option>
				<option value="us-west-2">us-west-2 (Oregon)</option>
				<option value="ap-south-1">ap-south-1 (Mumbai)</option>
				<option value="ap-northeast-1">ap-northeast-1 (Tokyo)</option>
				<option value="ap-southeast-1">ap-southeast-1 (Singapore)</option>
				<option value="eu-central-1">eu-central-1 (Frankfurt)</option>
				<option value="eu-west-1">eu-west-1 (Ireland)</option>
				<option value="us-east-2">us-east-2 (Ohio)</option>
			</select>
		</div>
		
		<div class="form-group">
			<label for="side-profile">AWS Profile</label>
			<input type="text" id="side-profile" placeholder="default" />
		</div>
		
		<div class="form-group">
			<label for="side-apikey">Mantle API Key</label>
			<input type="password" id="side-apikey" placeholder="API Key (Mantle Only)" />
		</div>

		<button class="btn" onclick="saveOnboarding()">Save Configurations</button>
		<button class="btn btn-secondary" onclick="runDiagnostics()">Run Diagnostics Scan</button>
		<button class="btn btn-secondary" onclick="openDashboard()">Open Control Dashboard</button>
	</div>

	<script>
		const vscode = acquireVsCodeApi();

		window.addEventListener('message', event => {
			const message = event.data;
			switch (message.command) {
				case 'state':
					updateChecklist(message.state);
					break;
			}
		});

		function openDashboard() {
			vscode.postMessage({ command: 'open-dashboard' });
		}

		function runDiagnostics() {
			vscode.postMessage({ command: 'run-diagnostics' });
		}

		function saveOnboarding() {
			const region = document.getElementById('side-region').value;
			const profile = document.getElementById('side-profile').value;
			const apiKey = document.getElementById('side-apikey').value;

			vscode.postMessage({
				command: 'save-onboarding',
				config: {
					region,
					awsProfile: profile,
					apiKey
				}
			});
		}

		let sideInitialLoad = true;

		function updateChecklist(state) {
			// Populate values on first load
			if (sideInitialLoad) {
				if (state.region) {
					document.getElementById('side-region').value = state.region;
				}
				if (state.profile) {
					document.getElementById('side-profile').value = state.profile;
				}
				if (state.hasApiKey) {
					document.getElementById('side-apikey').value = '••••••••';
				} else {
					document.getElementById('side-apikey').value = '';
				}
				sideInitialLoad = false;
			}

			// Step 1 check
			const step1 = document.getElementById('check-step1');
			if (state.region) {
				step1.className = 'checkbox-circle checked';
			} else {
				step1.className = 'checkbox-circle';
			}

			// Step 2 check
			const step2 = document.getElementById('check-step2');
			if (state.profile || state.hasApiKey) {
				step2.className = 'checkbox-circle checked';
			} else {
				step2.className = 'checkbox-circle';
			}

			// Step 3 check
			const step3 = document.getElementById('check-step3');
			if (state.diagnosticsRun) {
				step3.className = 'checkbox-circle checked';
			} else {
				step3.className = 'checkbox-circle';
			}
		}
	</script>
</body>
</html>`;
	}
}

# AWS Bedrock Bridge for Copilot Chat

AWS Bedrock Bridge is a premium, high-performance VS Code extension that enables secure, direct access to Amazon Bedrock models inside GitHub Copilot Chat.

Use state-of-the-art models like **Anthropic Claude 3.7 / 3.5**, **Meta Llama 3.3**, **Amazon Nova**, and **DeepSeek-R1** without leaving your local coding environment.

---

## Key Features

* **⚡ Real-time Native Streaming**: Built on the AWS Converse API with streaming support. Responses appear block-by-block instantly.
* **🛡️ Enterprise Security**: All code context, prompts, and completions stay securely within your own AWS account boundary, honoring your IAM policies and data residency choices.
* **🌐 Dynamic Multi-Region & Inference Profiles**: Supports standard regional foundation models alongside cross-region inference profiles (e.g. `us.`, `apac.`, `global.`) for maximum throughput and low latency.
* **🛠️ Model Access Verification**: Includes a built-in dashboard command to probe model permissions, verifying which models are enabled in your region with full error tracebacks.
* **⚙️ Custom Model Declarations**: Manually configure custom model IDs, ARNs, or private provisioned throughput profiles directly inside your VS Code settings.
* **🔌 Native Tool & Function Calling**: Integrates with Copilot's tool framework for multi-step tasks.

---

## Getting Started

### Prerequisites

1. **VS Code**: Version `1.104.0` or later with GitHub Copilot Chat installed.
2. **AWS Account**: Configured with AWS IAM credentials/profiles (e.g., standard IAM User, SSO credentials, or environment variables) that have Bedrock access.

### Configuration

Open your VS Code Settings (`Ctrl+,` or `Cmd+,`) and search for **AWS Bedrock Bridge** to configure your options:

```json
{
  "aws-bedrock.region": "ap-south-1",
  "aws-bedrock.awsProfile": "my-sso-profile",
  "aws-bedrock.customModels": [
    "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
    {
      "modelId": "my-custom-imported-model-id",
      "displayName": "My Custom Model",
      "contextLength": 200000,
      "maxOutputTokens": 8192,
      "supportsVision": true,
      "supportsToolCalling": true
    }
  ]
}
```

### Enable Models in Copilot Chat

1. Open the **Language Models** settings page by opening the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and selecting **Show Language Models**.
2. Find the models registered under the **AWS Bedrock Bridge** provider.
3. Check the checkboxes next to the models you want to use.
4. Open the Copilot Chat model selection dropdown—your checked models (marked with `🟢` for tested accessible status) will be ready for selection!

---

## Extension Commands

Access the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:

* `$(settings-gear) Manage AWS Bedrock Bridge`: Open the interactive setup dashboard to configure authentication profiles, regions, and view status.
* `$(dashboard) Test AWS Bedrock Model Access`: Probe each Bedrock model using a lightweight check, flagging active (`🟢`), legacy/disabled (`🔴`), or error (`🟡`) states with full tracebacks.
* `$(output) Show AWS Bedrock Bridge Logs`: Open the output log channel for debug trace messages.

---

## License & Credits

* **Author / Project Lead**: abhimanyus1997 (<abhimanyus1997@gmail.com>)
* **Acknowledgments**: Inspired by the original [bedrock-vscode-chat](https://github.com/easytocloud/bedrock-vscode-chat) project and the [HuggingFace VS Code Chat](https://github.com/huggingface/huggingface-vscode-chat) extension.
* **License**: Licensed under the MIT License.

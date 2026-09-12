import { createInvokeTool } from "./raw/invoke.js";
export function registerAllTools(api, clients, _channelCfg) {
    // Web search is provided by OpenClaw core's built-in web_search tool —
    // the plugin only registers tg_invoke.
    api.registerTool(createInvokeTool(clients), { name: "tg_invoke" });
}
//# sourceMappingURL=index.js.map
import { createInvokeTool } from "./raw/invoke.js";
import { createWebSearchTool } from "./web/search.js";
export function registerAllTools(api, clients, channelCfg) {
    const tools = [createInvokeTool(clients)];
    if (channelCfg?.webSearch?.enabled !== false) {
        tools.push(createWebSearchTool());
    }
    for (const tool of tools) {
        api.registerTool(tool, { name: tool.name });
    }
}
//# sourceMappingURL=index.js.map
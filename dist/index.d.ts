declare const _default: {
    id: string;
    name: string;
    description: string;
    configSchema: import("node_modules/openclaw/dist/plugin-sdk/src/channels/plugins/types.config.js").ChannelConfigSchema;
    register: (api: import("openclaw/plugin-sdk/channel-core").OpenClawPluginApi) => void;
    channelPlugin: import("openclaw/plugin-sdk/channel-core").ChannelPlugin<any, unknown, unknown>;
    setChannelRuntime?: (runtime: import("openclaw/plugin-sdk/channel-core").PluginRuntime) => void;
};
export default _default;
//# sourceMappingURL=index.d.ts.map
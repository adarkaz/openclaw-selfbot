import { defineSetupPluginEntry } from "openclaw/plugin-sdk/channel-core";
import { telegramSelfBotPlugin } from "./src/channel.js";

export default defineSetupPluginEntry(telegramSelfBotPlugin);

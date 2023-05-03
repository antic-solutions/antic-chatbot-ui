import { Action, Plugin, RemotePluginTool } from '@/types/agent';

import { createApiTools, createWebpageTools } from '.';
import { TaskExecutionContext } from './executor';
import google from './google';
import wikipedia from './wikipedia';

interface PluginsJson {
  internals: string[];
  urls: string[];
}

const internalPlugins = {
  [wikipedia.nameForModel]: wikipedia,
  [google.nameForModel]: google,
};

function snakeToCamel(obj: Record<string, any>) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  const camelObj: Record<string, any> = {};

  Object.keys(obj).forEach((key) => {
    const camelKey = key.replace(/(_\w)/g, (m) => m[1].toUpperCase());
    camelObj[camelKey] = snakeToCamel(obj[key]);
  });

  return camelObj;
}

const loadFromUrl = async (url: string): Promise<Plugin> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch plugin from ${url} with status ${res.status}`,
    );
  }
  const plugin = snakeToCamel(await res.json()) as RemotePluginTool;
  const apiSpecRes = await fetch(plugin.api.url);
  if (!apiSpecRes.ok) {
    throw new Error(
      `Failed to fetch API spec from ${plugin.api.url} with status ${apiSpecRes.status}`,
    );
  }
  const apiUrlJson = (await apiSpecRes.text()).trim();
  const apiSpec = `Usage Guide: ${plugin.descriptionForHuman}\n\nOpenAPI Spec: ${apiUrlJson}`;
  return {
    ...plugin,
    // override description for model.
    descriptionForModel: `Call this tool to get the OpenAPI spec (and usage guide)
for interacting with the ${plugin.nameForHuman} API.
You should only call this ONCE! What is the "
${plugin.nameForHuman} API useful for? "
${plugin.descriptionForHuman}`,
    apiSpec: `Usage Guide: ${plugin.descriptionForHuman}\n\nOpenAPI Spec: ${apiUrlJson}`,
    displayForUser: true,
    execute: async (ctx: TaskExecutionContext, action: Action) => apiSpec,
  };
};

let cache: Plugin[] | null = null;
// list plugins without private plugins.
export const listTools = async (): Promise<Plugin[]> => {
  if (cache !== null) {
    return cache;
  }

  const jsonUrls = (process.env.PLUGINS_JSON_URLS || '')
    .split(',')
    .filter(Boolean);
  const pluginJsons: PluginsJson[] = [];
  for (const jsonUrl of jsonUrls) {
    const response = await fetch(jsonUrl);
    if (!response.body) {
      throw new Error(
        `Failed to fetch plugin list from ${jsonUrl} with status ${response.status}`,
      );
    }
    const json = await response.json();
    pluginJsons.push(json);
  }

  const result: Plugin[] = [];
  const internals = (process.env.PLUGINS_INTERNAL || '')
    .split(',')
    .map((s) => s.trim());
  for (const plugin of internals) {
    if (internalPlugins[plugin] !== undefined) {
      result.push(internalPlugins[plugin]);
    } else {
      console.warn(`Unknown internal plugin ${plugin}.`);
    }
  }

  for (const pluginJson of pluginJsons) {
    for (const url of pluginJson.urls) {
      try {
        const tool = await loadFromUrl(url);
        result.push(tool);
      } catch (e) {
        console.warn(`Failed to load plugin from ${url}.`, e);
      }
    }
  }

  cache = result;
  return result;
};

// list all plugins including private plugins.
export const listAllTools = async (
  context: TaskExecutionContext,
): Promise<Plugin[]> => {
  const apiTools = createApiTools(context);
  const webTools = createWebpageTools(context);
  const availableTools = await listTools();

  return [...apiTools, ...webTools, ...availableTools];
};
// list plugins based on specified plugins
export const listToolsBySpecifiedPlugins = async (
  context: TaskExecutionContext,
  pluginNames: string[],
): Promise<Plugin[]> => {
  let result: Plugin[] = [];
  const plugins = (await listTools()).filter((p) =>
    pluginNames.includes(p.nameForModel),
  );
  if (plugins.some((p) => p.api)) {
    result = [...result, ...createApiTools(context)];
  }
  if (plugins.some((p) => !p.api)) {
    result = [...result, ...createWebpageTools(context)];
  }
  return [...result, ...plugins];
};

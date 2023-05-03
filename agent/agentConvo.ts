import { Plugin, PluginResult, ReactAgentResult } from '@/types/agent';
import { Message } from '@/types/chat';

import {
  DebugCallbackHandler,
  createAgentHistory,
  messagesToOpenAIMessages,
} from './agentUtil';
import { TaskExecutionContext } from './plugins/executor';
import { listToolsBySpecifiedPlugins } from './plugins/list';
import prompts from './prompts/agentConvo';

import chalk from 'chalk';
import { CallbackManager } from 'langchain/callbacks';
import { PromptTemplate } from 'langchain/prompts';
import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from 'openai';

export const executeReactAgent = async (
  context: TaskExecutionContext,
  enabledToolNames: string[],
  history: Message[],
  input: string,
  pluginResults: PluginResult[],
  verbose: boolean = false,
): Promise<ReactAgentResult> => {
  const callbackManager = new CallbackManager();
  if (verbose) {
    const handler = new DebugCallbackHandler();
    callbackManager.addHandler(handler);
  }

  const sytemPrompt: PromptTemplate = PromptTemplate.fromTemplate(
    prompts.systemPrefix,
  );

  const formatPrompt: PromptTemplate = PromptTemplate.fromTemplate(
    prompts.formatPrompt,
  );

  const userPrompt: PromptTemplate = PromptTemplate.fromTemplate(
    prompts.toolsPrompt,
  );

  const toolResponsePrompt: PromptTemplate = PromptTemplate.fromTemplate(
    prompts.toolResponsePrompt,
  );

  let toolResponse: ChatCompletionRequestMessage[] = [];
  if (pluginResults.length > 0) {
    for (const actionResult of pluginResults) {
      const toolResponseContent = await toolResponsePrompt.format({
        observation: actionResult.result,
      });
      toolResponse.push({
        role: 'assistant',
        content: toolResponseContent,
      });
    }
  }

  const tools = await listToolsBySpecifiedPlugins(context, enabledToolNames);
  const toolDescriptions = tools
    .map((tool) => tool.nameForModel + ': ' + tool.descriptionForModel)
    .join('\n');
  const toolNames = tools.map((tool) => tool.nameForModel).join(', ');

  const systemContent = await sytemPrompt.format({
    locale: context.locale,
  });
  const formatInstuctions = await formatPrompt.format({
    tool_names: toolNames,
  });

  const userContent = await userPrompt.format({
    input,
    tools: toolDescriptions,
    format_instructions: formatInstuctions,
    agent_scratchpad: toolResponse,
  });
  const encoding = await context.getEncoding();
  const modelId = context.model?.id || 'gpt-3.5-turbo';
  const agentHistory = messagesToOpenAIMessages(
    createAgentHistory(encoding, modelId, 500, history),
  );
  const openai = new OpenAIApi(new Configuration({ apiKey: context.apiKey }));
  const messages: ChatCompletionRequestMessage[] = [
    {
      role: 'system',
      content: systemContent,
    },
    ...agentHistory,
    {
      role: 'user',
      content: userContent,
    },
    ...toolResponse,
  ];

  const start = Date.now();
  if (verbose) {
    console.log(chalk.greenBright('LLM Request:'));
    for (const message of messages) {
      console.log(chalk.blue(message.role + ': ') + message.content);
    }
  }

  const result = await openai.createChatCompletion({
    model: modelId,
    messages,
    temperature: 0.0,
    stop: ['\nObservation:'],
  });

  const responseText = result.data.choices[0].message?.content;
  const ellapsed = Date.now() - start;
  if (verbose) {
    console.log(chalk.greenBright('LLM Response:'));
    console.log(`ellapsed: ${ellapsed / 1000} sec.`);
    console.log(responseText);
    console.log('');
  }
  const output = parseResult(tools, responseText!);
  return output;
};

export const parseResult = (
  tools: Plugin[],
  resultText: string,
): ReactAgentResult => {
  const trimmedText = resultText.trim();
  const regex = /```(\w+)?\s*(?<content>([\s\S]+?))\s*```/gm;
  const match = regex.exec(trimmedText);
  let json = '';
  if (match) {
    json = match.groups!.content;
  } else if (trimmedText[0] === '{') {
    json = trimmedText;
  }

  let result: { action: string; action_input: string } | null;
  try {
    result = JSON.parse(json);
  } catch (e) {
    console.log('Error parsing JSON', e);
    throw new Error('Error parsing JSON');
  }
  if (result === null) {
    throw new Error('Error parsing JSON');
  }

  if (result.action === 'Final Answer') {
    return {
      type: 'answer',
      answer: result.action_input,
    };
  }

  const tool = tools.find((tool) => tool.nameForModel === result!.action);
  if (!tool) {
    throw new Error(`Tool ${result.action} not found`);
  }

  return {
    type: 'action',
    plugin: tool,
    pluginInput: result.action_input,
    thought: '',
  };
};

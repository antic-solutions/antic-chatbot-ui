import { Plugin, PluginResult, ReactAgentResult } from '@/types/agent';

import { TaskExecutionContext } from './plugins/executor';
import { listToolsBySpecifiedPlugins } from './plugins/list';
import conversational from './prompts/conversational';
import notConversational from './prompts/notConversational';

import chalk from 'chalk';
import { CallbackManager, ConsoleCallbackHandler } from 'langchain/callbacks';
import { LLMChain } from 'langchain/chains';
import { LLMResult } from 'langchain/dist/schema';
import { OpenAI } from 'langchain/llms/openai';
import { PromptTemplate } from 'langchain/prompts';
import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from 'openai';

const strip = (str: string, c: string) => {
  const m = str.match(new RegExp(`${c}(.*)${c}`));
  if (m) {
    return m[1];
  }
  return str;
};

const stripQuotes = (str: string) => {
  return strip(strip(str, '"'), "'");
};
class _DebugCallbackHandler extends ConsoleCallbackHandler {
  alwaysVerbose: boolean = true;
  llmStartTime: number = 0;
  async handleLLMStart(
    llm: {
      name: string;
    },
    prompts: string[],
    runId: string,
  ): Promise<void> {
    this.llmStartTime = Date.now();
    console.log(chalk.greenBright('handleLLMStart ============'));
    console.log(prompts[0]);
    console.log('');
  }
  async handleLLMEnd(output: LLMResult, runId: string) {
    const duration = Date.now() - this.llmStartTime;
    console.log(chalk.greenBright('handleLLMEnd =============='));
    console.log(`ellapsed: ${duration / 1000} sec.`);
    console.log(output.generations[0][0].text);
    console.log('');
  }
  async handleText(text: string): Promise<void> {
    console.log(chalk.greenBright('handleText =========='));
    console.log(text);
    console.log('');
  }
}

export const executeReactAgent = async (
  context: TaskExecutionContext,
  enabledToolNames: string[],
  input: string,
  toolActionResults: PluginResult[],
  verbose: boolean = false,
): Promise<ReactAgentResult> => {
  const callbackManager = new CallbackManager();
  if (verbose) {
    const handler = new _DebugCallbackHandler();
    callbackManager.addHandler(handler);
  }

  const model: OpenAI = new OpenAI({
    temperature: 0,
    verbose: true,
    callbackManager,
    openAIApiKey: context.apiKey,
  });
  const prompt: PromptTemplate = PromptTemplate.fromTemplate(
    conversational.prefix +
      '\n\n' +
      conversational.prompt +
      '\n\n' +
      conversational.suffix,
  );
  const llmChain: LLMChain = new LLMChain({
    llm: model,
    prompt,
    verbose: true,
    callbackManager,
  });

  let agentScratchpad = '';
  if (toolActionResults.length > 0) {
    for (const actionResult of toolActionResults) {
      agentScratchpad += `Thought:${actionResult.action.thought}
Action:${actionResult.action.plugin}
Action Input: ${actionResult.action.pluginInput}
Observation: ${actionResult.result}\n`;
    }
  }
  agentScratchpad += 'Thought:';

  const tools = await listToolsBySpecifiedPlugins(context, enabledToolNames);
  const toolDescriptions = tools
    .map((tool) => tool.nameForModel + ': ' + tool.descriptionForModel)
    .join('\n');
  const toolNames = tools.map((tool) => tool.nameForModel).join(',');
  const result = await llmChain.call({
    tool_descriptions: toolDescriptions,
    tool_names: toolNames,
    input,
    agent_scratchpad: agentScratchpad,
  });
  return _parseResult(tools, result.text);
};

const _parseResult = (tools: Plugin[], result: string): ReactAgentResult => {
  const matchThought = result.match(/(.*)\nAction:/);
  let thought = '';
  if (matchThought) {
    thought = matchThought[1] || '';
  }
  const matchAction = result.match(/Action: (.*)/);
  if (thought && matchAction) {
    const actionStr = matchAction[1];
    const matchActionInput = result.match(/Action Input: (.*)/);
    const toolInputStr = matchActionInput
      ? (matchActionInput[1] as string)
      : '';
    const toolInput = stripQuotes(toolInputStr.trim());
    const action = stripQuotes(actionStr.trim());
    const tool = tools.find((tool) => tool.nameForModel === action);
    if (!tool) throw new Error('Tool not found: ' + action);
    return {
      type: 'action',
      thought: thought.trim(),
      plugin: tool,
      pluginInput: toolInput,
    };
  } else {
    const matchAnswer = result.match(/AI:(.*)/);
    const answer = matchAnswer ? matchAnswer[1] : '';
    return {
      type: 'answer',
      answer,
    };
  }
};

export const executeNotConversationalReactAgent = async (
  context: TaskExecutionContext,
  enabledToolNames: string[],
  input: string,
  toolActionResults: PluginResult[],
  verbose: boolean = false,
): Promise<ReactAgentResult> => {
  const callbackManager = new CallbackManager();
  if (verbose) {
    const handler = new _DebugCallbackHandler();
    callbackManager.addHandler(handler);
  }

  const prompt: PromptTemplate = PromptTemplate.fromTemplate(
    notConversational.prefix +
      '\n\n' +
      notConversational.prompt +
      '\n\n' +
      notConversational.suffix,
  );

  let agentScratchpad = '';
  if (toolActionResults.length > 0) {
    for (const actionResult of toolActionResults) {
      let observation = actionResult.result;
      if (observation.split('\n').length > 5) {
        observation = `"""\n${observation}\n"""`;
      }
      agentScratchpad += `Thought: ${actionResult.action.thought}
Action: ${actionResult.action.plugin.nameForModel}
Action Input: ${actionResult.action.pluginInput}
Observation: ${observation}\n`;
    }
  }
  agentScratchpad += 'Thought:';

  const tools = await listToolsBySpecifiedPlugins(context, enabledToolNames);
  const toolDescriptions = tools
    .map((tool) => tool.nameForModel + ': ' + tool.descriptionForModel)
    .join('\n');
  const toolNames = tools.map((tool) => tool.nameForModel).join(', ');

  const userContent = await prompt.format({
    locale: context.locale,
    tool_descriptions: toolDescriptions,
    tool_names: toolNames,
    input,
    agent_scratchpad: agentScratchpad,
  });
  const openai = new OpenAIApi(new Configuration({ apiKey: context.apiKey }));
  const messages: ChatCompletionRequestMessage[] = [
    {
      role: 'system',
      content: `Use the language ${context.locale} for your answer.`,
    },
    {
      role: 'user',
      content: userContent,
    },
  ];

  const start = Date.now();
  if (verbose) {
    console.log(chalk.greenBright('LLM Request:'));
    console.log(messages[0].content);
    console.log(messages[1].content);
    console.log('');
  }

  const result = await openai.createChatCompletion({
    model: context.model?.id || 'gpt-3.5-turbo',
    messages,
    temperature: 0,
  });

  const responseText = result.data.choices[0].message?.content;
  const ellapsed = Date.now() - start;
  if (verbose) {
    console.log(chalk.greenBright('LLM Response:'));
    console.log(`ellapsed: ${ellapsed / 1000} sec.`);
    console.log(responseText);
    console.log('');
  }
  const output = parseResultForNotConversational(tools, responseText!);
  return output;
};

export const parseResultForNotConversational = (
  tools: Plugin[],
  result: string,
): ReactAgentResult => {
  const matchAnswer = result.match(/Final Answer:(.*)/);
  const answer = matchAnswer ? matchAnswer[1] : '';
  const answerResult: ReactAgentResult = {
    type: 'answer',
    answer: answer.trim(),
  };

  // if the positivity is high enough, return the answer
  const matchPositivity = result.match(/\nPositivity:(.*)/);
  if (matchPositivity && parseFloat(matchPositivity[1].trim()) >= 9) {
    if (answer) {
      return answerResult;
    }
  }

  const matchThought = result.match(/(.*)\nAction:/);
  let thought = '';
  if (matchThought) {
    thought = matchThought[1] || '';
  }
  const matchAction = result.match(/Action:(.*)(\n|$)/);
  let action = '';
  if (thought && matchAction) {
    const actionStr = matchAction[1];
    action = stripQuotes(actionStr.trim());
  }
  if (thought && action && action.indexOf('None') === -1) {
    const tool = tools.find((t) => t.nameForModel === action);
    if (!tool) {
      const error = new Error(`Tool ${action} not found`);
      if (answer) {
        // return the answer if already has for better experience.
        return answerResult;
      } else {
        throw error;
      }
    }
    const matchActionInput = result.match(/Action Input: (.*)(\n|$)/);
    const toolInputStr = matchActionInput
      ? (matchActionInput[1] as string)
      : '';
    const toolInput = stripQuotes(toolInputStr.trim());
    return {
      type: 'action',
      thought: thought.trim(),
      plugin: {
        nameForModel: tool.nameForModel,
        nameForHuman: tool.nameForHuman,
        descriptionForHuman: tool.descriptionForHuman,
        descriptionForModel: tool.descriptionForModel,
        logoUrl: tool.logoUrl,
        displayForUser: tool.displayForUser,
      },
      pluginInput: toolInput,
    };
  }
  return answerResult;
};
